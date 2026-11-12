/**
 * The student map's full-screen view: every teacher's students on a map, each in the color
 * of their class day and the shape of their teacher, with the teachers' driving ranges, and
 * families who aren't students yet, to see where each would fit into a teacher's day.
 * Files are read here in the browser; they aren't sent to the server or saved there.
 */
import { Box, Button, chakra, Heading, HStack, IconButton, Input, Text } from "@chakra-ui/react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  LuDownload,
  LuEye,
  LuEyeOff,
  LuPencil,
  LuPlus,
  LuSearch,
  LuTrash2,
  LuUpload,
  LuUsers,
} from "react-icons/lu";
import { parseCsv, toCsv } from "../../../common/csv.ts";
import { addressKey, isLookable } from "../../widget-kit/map/address.ts";
import { detectMapping, rowAddress, rowName } from "../../widget-kit/map/columns.ts";
import { formatDrive } from "../../widget-kit/map/distance.ts";
import {
  batchSize,
  findAddresses,
  findPlace,
  forgetKnown,
  loadKnown,
  noMatchMessage,
  saveKnown,
} from "../../widget-kit/map/geocode-client.ts";
import { chunks, type Known, lookupsNeeded } from "../../widget-kit/map/lookups.ts";
import { type Circle, type Dot, MapView } from "../../widget-kit/map/map-view.tsx";
import { ShapeDot } from "../../widget-kit/map/shape.tsx";
import type { FullScreenProps } from "../../widget-kit/views.tsx";
import { splitAddress } from "./address-split.ts";
import type { StudentMapConfig } from "./config.ts";
import { type Day, dayColor, days, fullDay, sundayFirst } from "./days.ts";
import { blankDraft, draftOf, withStudent } from "./edit.ts";
import { describeFit, fitsFor, reachedBy, type TeacherDays } from "./fit.ts";
import { classesOf, parseRoll, type Student } from "./report.ts";
import { dayRoute, totalMinutes } from "./route.ts";
import { StudentEditor } from "./student-editor.tsx";
import { forgetState, loadState, savedProblem, saveState } from "./state-storage.ts";
import {
  blankTeacher,
  fromStudentId,
  placeOf,
  prospectBase,
  studentId,
  type Teacher,
  withRolls,
} from "./teachers.ts";
import { formatSpan } from "./time.ts";

const oneLine = (text: string) => text.replaceAll(/\s+/g, " ").trim();
const rangeOf = (t: Teacher): number => {
  const miles = Number(t.milesText);
  return Number.isFinite(miles) && miles > 0 ? miles : 0;
};
/** How many fits to show for each new family before "more". */
const shownFits = 4;

export function StudentMapPage({ widgetId }: FullScreenProps<StudentMapConfig>) {
  const [saved] = useState(() => loadState(widgetId));
  const [teachers, setTeachers] = useState<ReadonlyArray<Teacher>>(saved.teachers);
  const [prospects, setProspects] = useState(saved.prospects);
  const [hidden, setHidden] = useState<ReadonlyArray<Day>>(saved.hiddenDays);
  const [lessonText, setLessonText] = useState(saved.lessonText);
  const [newName, setNewName] = useState("");
  const [newText, setNewText] = useState("");
  const [known, setKnown] = useState<Known>(() => loadKnown());
  // Bumped to have the map fit itself to everything again.
  const [fitRun, setFitRun] = useState(0);
  const [status, setStatus] = useState<{ error: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [showAllFits, setShowAllFits] = useState<ReadonlyArray<number>>([]);
  // The student being edited: a position in a teacher's list, or null for a new one.
  const [editing, setEditing] = useState<{ teacherId: number; index: number | null } | null>(null);
  const editor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const problem = saveState(widgetId, { teachers, prospects, hiddenDays: hidden, lessonText });
    setStatus((now) =>
      problem !== null ? { error: true, text: problem } : now?.text === savedProblem ? null : now
    );
  }, [widgetId, teachers, prospects, hidden, lessonText]);

  /** Finds a teacher's address once it's typed, if it hasn't been found yet, and shows the map the range. */
  const findTeacher = async (t: Teacher) => {
    if (t.text.trim() === "" || placeOf(t) !== null || busy) return;
    setBusy(true);
    const ok = await locateTeacher(t);
    setBusy(false);
    if (ok) {
      setStatus(null);
      setFitRun((n) => n + 1);
    }
  };

  const patch = (id: number, change: Partial<Teacher>) =>
    setTeachers(teachers.map((t) => t.id === id ? { ...t, ...change } : t));

  /** Reads a class roll file, which lists every teacher's classes. */
  const loadRoll = async (file: File) => {
    const rolls = parseRoll(await file.text());
    if (rolls.every((r) => r.students.length === 0)) {
      setStatus({ error: true, text: "No students were found in that file." });
      return;
    }
    setTeachers(withRolls(teachers, rolls, file.name));
    setStatus({
      error: false,
      text: `Found ${rolls.length} teacher(s) and ${
        rolls.reduce((n, r) => n + r.students.length, 0)
      } students.`,
    });
  };

  const loadProspects = async (file: File) => {
    const [headers, ...rows] = parseCsv(await file.text());
    const mapping = headers === undefined ? null : detectMapping(headers);
    if (mapping === null || mapping.street === null) {
      setStatus({ error: true, text: "Couldn't find a street address column in that file." });
      return;
    }
    const first = Math.max(-1, ...prospects.map((p) => p.id)) + 1;
    const added = rows.map((row, i) => {
      const a = rowAddress(row, mapping);
      return {
        id: first + i,
        name: rowName(row, mapping),
        text: oneLine(`${a.street}, ${a.city}, ${a.state} ${a.zip}`),
      };
    });
    setProspects([...prospects, ...added]);
    setStatus({ error: false, text: `Added ${added.length} families.` });
  };

  const lessonParsed = Number(lessonText);
  const lessonOk = Number.isFinite(lessonParsed) && lessonParsed > 0;
  const lesson = lessonOk ? lessonParsed : 30;
  const ready = !busy && (teachers.length > 0 || prospects.length > 0) && lessonOk;

  /** Finds the coordinates of every address not already known; false (with a message) if it fails. */
  const locateAddresses = async (
    forTeachers: ReadonlyArray<Teacher>,
    forProspects: typeof prospects,
  ): Promise<boolean> => {
    let nowKnown = known;
    const addresses = [
      ...forTeachers.flatMap((t) => t.students.map((s) => splitAddress(s.address))),
      ...forProspects.map((p) => splitAddress(p.text)),
    ];
    const needed = lookupsNeeded(addresses, nowKnown);
    let done = 0;
    // An address with no state and zip ("123 Main St, Denver") can't go in a batch; each is
    // looked up on its own, as one line.
    const loose = [
      ...forTeachers.flatMap((t) => t.students.map((s) => s.address)),
      ...forProspects.map((p) => p.text),
    ].filter((text) => text.trim() !== "" && !isLookable(splitAddress(text)))
      .filter((text, i, all) =>
        all.findIndex((o) => addressKey(splitAddress(o)) === addressKey(splitAddress(text))) === i
      )
      .filter((text) => !(addressKey(splitAddress(text)) in nowKnown));
    for (const text of loose) {
      setStatus({ error: false, text: `Finding ${text}…` });
      const found = await findPlace(text);
      if (!found.ok && found.errorMessage !== noMatchMessage) {
        setKnown(nowKnown);
        saveKnown(nowKnown);
        setStatus({ error: true, text: found.errorMessage });
        return false;
      }
      nowKnown = {
        ...nowKnown,
        [addressKey(splitAddress(text))]: found.ok
          ? { lat: found.value.lat, lon: found.value.lon }
          : null,
      };
    }
    for (const batch of chunks(needed, batchSize)) {
      setStatus({ error: false, text: `Finding addresses… ${done} of ${needed.length}` });
      const result = await findAddresses(batch);
      if (!result.ok) {
        setKnown(nowKnown);
        saveKnown(nowKnown);
        setStatus({ error: true, text: result.errorMessage });
        return false;
      }
      nowKnown = { ...nowKnown, ...Object.fromEntries(result.value) };
      done += batch.length;
    }
    saveKnown(nowKnown);
    setKnown(nowKnown);
    return true;
  };

  /** Finds a teacher's address on the map, and keeps where it was found with them. */
  const locateTeacher = async (t: Teacher): Promise<boolean> => {
    const text = t.text.trim();
    if (text === "") return true;
    setStatus({ error: false, text: `Finding ${t.name || "the teacher"}'s address…` });
    const place = await findPlace(text);
    if (!place.ok) {
      setStatus({ error: true, text: `${t.name || "Teacher"}: ${place.errorMessage}` });
      return false;
    }
    const found = { text, lat: place.value.lat, lon: place.value.lon, label: place.value.label };
    setTeachers((all) => all.map((o) => o.id === t.id ? { ...o, found } : o));
    return true;
  };

  const run = async () => {
    setBusy(true);
    setSelected(null);
    for (const t of teachers.filter((t) => placeOf(t) === null)) {
      if (!(await locateTeacher(t))) {
        setBusy(false);
        return;
      }
    }
    const ok = await locateAddresses(teachers, prospects);
    setBusy(false);
    if (ok) {
      setFitRun((n) => n + 1);
      setStatus(null);
    }
  };

  /** Saves an edited or new student, then finds the address on the map if it's a new one. */
  const saveStudent = async (student: Student) => {
    if (editing === null) return;
    const next = teachers.map((t) =>
      t.id === editing.teacherId ? withStudent(t, editing.index, student) : t
    );
    setTeachers(next);
    setEditing(null);
    setBusy(true);
    const ok = await locateAddresses(next, prospects);
    setBusy(false);
    if (ok) {
      // The lookups just saved are in this browser's storage, but state is a render behind.
      const found = loadKnown()[addressKey(splitAddress(student.address))];
      setStatus(
        student.address.trim() === ""
          ? { error: false, text: `${student.name} has no address, so isn't on the map.` }
          : found == null
          ? {
            error: true,
            text:
              `Couldn't find "${student.address}" on the map. Check the spelling, and add the city, state and zip.`,
          }
          : null,
      );
    }
  };

  const deleteStudent = () => {
    if (editing === null || editing.index === null) return;
    setTeachers(
      teachers.map((t) => t.id === editing.teacherId ? withStudent(t, editing.index, null) : t),
    );
    setEditing(null);
    setSelected(null);
  };

  const edit = (target: { teacherId: number; index: number | null }) => {
    setEditing(target);
    // The form is further down than the teacher's card or the student's row.
    setTimeout(() => editor.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 0);
  };

  const shownDays = days.filter((d) => !hidden.includes(d));

  // Each teacher's students, with where they live and their classes, and ids that are unique.
  const staff = useMemo(
    () =>
      teachers.map((t) => ({
        teacher: t,
        students: t.students.map((s, i) => ({
          ...s,
          id: studentId(t.id, i),
          classes: classesOf(s),
          at: known[addressKey(splitAddress(s.address))] ?? null,
        })),
      })),
    [teachers, known],
  );
  const visibleStaff = staff.filter((s) => s.teacher.visible);

  const placedProspects = useMemo(
    () =>
      prospects.flatMap((p) => {
        const at = known[addressKey(splitAddress(p.text))];
        return at == null ? [] : [{ ...p, at }];
      }),
    [prospects, known],
  );
  const unplacedStudents = visibleStaff.reduce(
    (n, s) => n + s.students.filter((x) => x.at === null).length,
    0,
  );
  const unplacedProspects = prospects.length - placedProspects.length;
  const anyPlaced = teachers.some((t) => placeOf(t) !== null) || placedProspects.length > 0 ||
    visibleStaff.some((s) => s.students.some((x) => x.at !== null));

  const dayCounts = days.map((d) => ({
    day: d,
    count: visibleStaff.reduce(
      (n, s) => n + s.students.filter((x) => x.days.includes(d)).length,
      0,
    ),
  })).filter((d) => d.count > 0);

  const dots: ReadonlyArray<Dot> = useMemo(() => {
    const fromStudents = visibleStaff.flatMap(({ teacher, students }) =>
      students.flatMap((s): ReadonlyArray<Dot> => {
        const visible = s.days.filter((d) => shownDays.includes(d));
        return s.at === null || visible.length === 0 ? [] : [{
          id: s.id,
          at: s.at,
          colors: visible.map((d) => dayColor[d]),
          shape: teacher.shape,
          label: `${s.name} (${teacher.name}): ${
            s.classes.filter((c) => visible.includes(c.day))
              .map((c) => `${c.day} ${formatSpan(c.start, c.end)}`.trim()).join(", ")
          }`,
        }];
      })
    );
    const fromProspects = placedProspects.map((p): Dot => ({
      id: prospectBase + p.id,
      at: p.at,
      colors: ["#111827"],
      shape: "diamond",
      label: `${p.name} (not a student yet)`,
    }));
    return [...fromStudents, ...fromProspects];
  }, [visibleStaff, placedProspects, hidden]);

  const circles: ReadonlyArray<Circle> = visibleStaff.flatMap(({ teacher }) => {
    const place = placeOf(teacher);
    return place === null ? [] : [{
      at: place.at,
      miles: rangeOf(teacher),
      label: teacher.name.trim() !== "" ? teacher.name.trim() : place.label,
      shape: teacher.shape,
    }];
  });

  // Each day's routes, in a week that starts on Sunday: per teacher, the classes in time
  // order with the drive from each to the next. Only that day's classes are compared.
  const routes = days
    .toSorted((a, b) => sundayFirst(a) - sundayFirst(b))
    .filter((d) => shownDays.includes(d))
    .flatMap((day) => {
      const groups = visibleStaff.flatMap(({ teacher, students }) => {
        const route = dayRoute(
          students.flatMap((s) =>
            s.classes.filter((c) => c.day === day).map((time) => ({
              item: s,
              name: s.name,
              at: s.at,
              time,
            }))
          ),
        );
        return route.length === 0 ? [] : [{ teacher, route }];
      });
      return groups.length === 0 ? [] : [{ day, groups }];
    });

  // What the fit needs of each visible teacher: where they start, their range, their classes.
  const teacherDays: ReadonlyArray<TeacherDays> = visibleStaff.map(({ teacher, students }) => ({
    teacher: teacher.name.trim() !== "" ? teacher.name.trim() : "Teacher",
    home: placeOf(teacher)?.at ?? null,
    miles: rangeOf(teacher),
    days: shownDays.flatMap((day) => {
      const booked = students.flatMap((s) =>
        s.classes.filter((c) => c.day === day).map((c) => ({
          name: s.name,
          at: s.at,
          start: c.start,
          end: c.end,
        }))
      );
      return booked.length === 0 ? [] : [{ day, booked }];
    }),
  }));

  const leads = placedProspects.map((p) => ({
    ...p,
    fits: fitsFor(p.at, teacherDays, lesson),
    reachedBy: reachedBy(p.at, teacherDays),
  }));
  const rangesKnown = teacherDays.some((t) => t.home !== null && t.miles > 0);

  const download = () => {
    const rows = [
      ["Name", "Address", "In range of", "Best fit", "Other fits"],
      ...leads.map((l) => {
        const [best, ...others] = l.fits;
        return [
          l.name,
          l.text,
          l.reachedBy.join("; "),
          best === undefined ? "" : `${best.teacher}, ${best.day}: ${describeFit(best)}`,
          others.slice(0, 5).map((f) => `${f.teacher}, ${f.day}: ${describeFit(f)}`).join(" | "),
        ];
      }),
    ];
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "new-families.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const label = (text: string) => <Text fontSize="sm" fontWeight="medium" mb="1">{text}</Text>;

  return (
    <Box display="flex" h="full" w="full" bg="bg" color="fg">
      <Box
        w="28rem"
        flexShrink={0}
        overflowY="auto"
        p="1.25rem"
        display="flex"
        flexDirection="column"
        gap="1rem"
        borderRightWidth="1px"
      >
        <Heading size="lg">Student Map</Heading>
        <Text fontSize="sm" color="fg.muted">
          See where every teacher's students are, by the day of their class and the shape of their
          teacher, and where new families would fit into a teacher's day. Your files are read in
          this browser and aren't uploaded or saved on a server. Addresses (not names) are sent once
          to the US Census geocoder to find their coordinates; the coordinates are kept only in this
          browser.
        </Text>

        <Box>
          {label("1. Teachers and their students")}
          <Box display="flex" flexDirection="column" gap="0.5rem">
            {teachers.map((t) => (
              <Box
                key={t.id}
                p="0.5rem"
                borderRadius="md"
                bg="bg.muted"
                opacity={t.visible ? 1 : 0.6}
              >
                <HStack gap="1" mb="1">
                  <ShapeDot shape={t.shape} size={16} colors={["#4b5563"]} outline="#ffffff" />
                  <Input
                    size="sm"
                    flex="1"
                    value={t.name}
                    placeholder="Teacher name"
                    aria-label="Teacher name"
                    onChange={(e) => patch(t.id, { name: e.target.value })}
                  />
                  <IconButton
                    aria-label={t.visible ? "Hide this teacher" : "Show this teacher"}
                    title={t.visible
                      ? "Hide: off the map, and out of where new families fit"
                      : "Show on the map and in the fit"}
                    size="xs"
                    variant="ghost"
                    onClick={() => patch(t.id, { visible: !t.visible })}
                  >
                    {t.visible ? <LuEye /> : <LuEyeOff />}
                  </IconButton>
                  <IconButton
                    aria-label="Remove this teacher"
                    size="xs"
                    variant="ghost"
                    onClick={() => setTeachers(teachers.filter((o) => o.id !== t.id))}
                  >
                    <LuTrash2 />
                  </IconButton>
                </HStack>
                <HStack gap="1" mb="1">
                  <Input
                    size="sm"
                    flex="1"
                    value={t.text}
                    placeholder="Their address, or cross streets (optional)"
                    aria-label="Teacher address"
                    onChange={(e) => patch(t.id, { text: e.target.value })}
                    onBlur={() => void findTeacher(t)}
                    onKeyDown={(e) => e.key === "Enter" && void findTeacher(t)}
                  />
                  <Input
                    size="sm"
                    w="4.5rem"
                    inputMode="decimal"
                    aria-label="Miles"
                    value={t.milesText}
                    borderColor={rangeOf(t) > 0 ? undefined : "red.500"}
                    onChange={(e) => patch(t.id, { milesText: e.target.value })}
                  />
                  <Text fontSize="xs">mi</Text>
                </HStack>
                {t.text.trim() !== "" && (
                  <Text fontSize="xs" color={placeOf(t) === null ? "fg.muted" : undefined} mb="1">
                    {placeOf(t) === null
                      ? "Press Enter or click away to find this address and draw their range."
                      : `Range drawn from ${placeOf(t)?.label}`}
                  </Text>
                )}
                <HStack justify="space-between">
                  <Text fontSize="xs" color="fg.muted">
                    {t.students.length} students · {t.fileName}
                  </Text>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => edit({ teacherId: t.id, index: null })}
                  >
                    <LuPlus /> Add a student
                  </Button>
                </HStack>
              </Box>
            ))}
          </Box>
          <HStack mt="2" gap="2" wrap="wrap">
            <Button as="label" size="sm" variant="outline" cursor="pointer" mt="2">
              <LuUpload />{" "}
              {teachers.length === 0 ? "Choose the class roll" : "Load a newer class roll"}
              <input
                type="file"
                accept=".txt,text/plain"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file !== undefined) void loadRoll(file);
                  e.target.value = "";
                }}
              />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const added = blankTeacher(teachers);
                setTeachers([...teachers, added]);
              }}
            >
              <LuPlus /> Add a teacher by hand
            </Button>
          </HStack>
          <Text fontSize="xs" color="fg.muted" mt="1">
            The class roll (.txt) lists every teacher: one is added for each instructor in it.
            Loading a newer file updates their students and keeps the addresses and ranges you
            entered. You can also add a teacher by hand, then add their students one at a time. A
            teacher's address draws their driving range, and is where it's measured from. Distance
            is in a straight line; drive times are rough estimates.
          </Text>
        </Box>

        <Box>
          {label("2. New families (optional)")}
          <Box display="flex" flexDirection="column" gap="1">
            <Input
              size="sm"
              value={newName}
              placeholder="Family or student name"
              aria-label="Family name"
              onChange={(e) => setNewName(e.target.value)}
            />
            <HStack gap="1">
              <Input
                size="sm"
                flex="1"
                value={newText}
                placeholder="123 Main St, Denver, CO 80210"
                aria-label="Address"
                onChange={(e) => setNewText(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={newText.trim() === ""}
                onClick={() => {
                  const id = Math.max(-1, ...prospects.map((p) => p.id)) + 1;
                  setProspects([...prospects, {
                    id,
                    name: newName.trim() !== "" ? newName.trim() : oneLine(newText),
                    text: oneLine(newText),
                  }]);
                  setNewName("");
                  setNewText("");
                }}
              >
                <LuPlus /> Add
              </Button>
            </HStack>
            <Button as="label" size="xs" variant="ghost" alignSelf="flex-start" cursor="pointer">
              <LuUpload /> Add from a CSV (name, street, city, state, zip)
              <input
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file !== undefined) void loadProspects(file);
                  e.target.value = "";
                }}
              />
            </Button>
            <HStack gap="1">
              <Text fontSize="xs">Lesson length</Text>
              <Input
                size="xs"
                w="3.5rem"
                inputMode="numeric"
                aria-label="Lesson length in minutes"
                value={lessonText}
                borderColor={lessonOk ? undefined : "red.500"}
                onChange={(e) => setLessonText(e.target.value)}
              />
              <Text fontSize="xs">min, to see if a lesson fits between two classes</Text>
            </HStack>
          </Box>
        </Box>

        <Button
          size="sm"
          colorPalette="blue"
          alignSelf="flex-start"
          disabled={!ready}
          onClick={() => void run()}
        >
          <LuSearch /> {busy ? "Working…" : "Show on map"}
        </Button>
        {status !== null && (
          <Text fontSize="sm" color={status.error ? "fg.error" : "fg.muted"}>{status.text}</Text>
        )}

        {dayCounts.length > 0 && (
          <Box>
            {label("Days (click to show or hide)")}
            <HStack wrap="wrap" gap="1">
              {dayCounts.map(({ day, count }) => {
                const on = !hidden.includes(day);
                return (
                  <Button
                    key={day}
                    size="xs"
                    variant="outline"
                    opacity={on ? 1 : 0.45}
                    onClick={() =>
                      setHidden(on ? [...hidden, day] : hidden.filter((d) => d !== day))}
                  >
                    <Box w="0.7rem" h="0.7rem" borderRadius="full" bg={dayColor[day]} />
                    {day} ({count})
                  </Button>
                );
              })}
            </HStack>
          </Box>
        )}

        {anyPlaced && (unplacedStudents > 0 || unplacedProspects > 0) && (
          <Text fontSize="xs" color="fg.muted">
            {unplacedStudents > 0 && `${unplacedStudents} student(s) `}
            {unplacedStudents > 0 && unplacedProspects > 0 && "and "}
            {unplacedProspects > 0 && `${unplacedProspects} new famil(ies) `}
            couldn't be placed on the map: no address was found.
          </Text>
        )}

        {prospects.length > 0 && (
          <Box>
            <HStack justify="space-between" mb="1">
              <Text fontSize="sm" fontWeight="medium">
                New families ({prospects.length}): where each would fit
              </Text>
              {leads.length > 0 && (
                <Button size="xs" variant="ghost" onClick={download}>
                  <LuDownload /> CSV
                </Button>
              )}
            </HStack>
            <Box display="flex" flexDirection="column" gap="0.25rem">
              {prospects.map((p) => {
                const lead = leads.find((l) => l.id === p.id);
                const all = showAllFits.includes(p.id);
                return (
                  <Box
                    key={p.id}
                    p="0.4rem"
                    borderRadius="md"
                    bg={selected === prospectBase + p.id ? "bg.emphasized" : "bg.muted"}
                  >
                    <HStack justify="space-between" align="start">
                      <chakra.button
                        textAlign="left"
                        flex="1"
                        onClick={() => setSelected(prospectBase + p.id)}
                      >
                        <Text fontSize="sm" fontWeight="medium">{p.name}</Text>
                        <Text fontSize="xs" color="fg.muted">{p.text}</Text>
                      </chakra.button>
                      <IconButton
                        aria-label="Remove"
                        size="xs"
                        variant="ghost"
                        onClick={() => setProspects(prospects.filter((o) => o.id !== p.id))}
                      >
                        <LuTrash2 />
                      </IconButton>
                    </HStack>
                    {lead === undefined
                      ? (
                        <Text fontSize="xs" color="fg.muted" mt="1">
                          {anyPlaced ? "No address was found." : 'Press "Show on map" to place it.'}
                        </Text>
                      )
                      : (
                        <Box mt="1">
                          {rangesKnown && (
                            <Text
                              fontSize="xs"
                              color={lead.reachedBy.length > 0 ? undefined : "fg.error"}
                            >
                              {lead.reachedBy.length > 0
                                ? `In range of ${lead.reachedBy.join(", ")}`
                                : "Outside every teacher's range"}
                            </Text>
                          )}
                          {lead.fits.length === 0
                            ? (
                              <Text fontSize="xs" color="fg.error">
                                No gap fits a {lesson} minute lesson in any teacher's day.
                              </Text>
                            )
                            : (
                              <>
                                <Text fontSize="xs" color="fg.muted" mt="1">
                                  Best fits, least extra driving first:
                                </Text>
                                {(all ? lead.fits : lead.fits.slice(0, shownFits)).map((f, i) => (
                                  <Box
                                    key={i}
                                    fontSize="xs"
                                    mt="0.25rem"
                                    pl="0.4rem"
                                    borderLeftWidth="3px"
                                    style={{ borderLeftColor: dayColor[f.day] }}
                                  >
                                    <Text fontSize="xs" fontWeight="medium">
                                      {f.teacher} · {fullDay[f.day]}
                                    </Text>
                                    <Text fontSize="xs">{describeFit(f)}</Text>
                                  </Box>
                                ))}
                                {lead.fits.length > shownFits && (
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    onClick={() =>
                                      setShowAllFits(
                                        all
                                          ? showAllFits.filter((id) => id !== p.id)
                                          : [...showAllFits, p.id],
                                      )}
                                  >
                                    {all
                                      ? "Show fewer"
                                      : `Show ${lead.fits.length - shownFits} more`}
                                  </Button>
                                )}
                              </>
                            )}
                        </Box>
                      )}
                  </Box>
                );
              })}
            </Box>
          </Box>
        )}

        {editing !== null && (() => {
          const owner = teachers.find((t) => t.id === editing.teacherId);
          const current = owner === undefined || editing.index === null
            ? undefined
            : owner.students[editing.index];
          if (owner === undefined || (editing.index !== null && current === undefined)) return null;
          return (
            <Box ref={editor}>
              <StudentEditor
                key={`${editing.teacherId}-${editing.index}`}
                teacherName={owner.name}
                existing={current !== undefined}
                initial={current === undefined ? blankDraft : draftOf(current, classesOf(current))}
                onSave={(student) => void saveStudent(student)}
                onDelete={deleteStudent}
                onCancel={() => setEditing(null)}
              />
            </Box>
          );
        })()}

        {routes.length > 0 && (
          <Box>
            <HStack mb="1" gap="1">
              <LuUsers />
              <Text fontSize="sm" fontWeight="medium">Students by day, in class order</Text>
            </HStack>
            <Text fontSize="xs" color="fg.muted" mb="1">
              Between classes: the rough drive time (straight-line distance, plus 30% for roads, at
              30 mph) and the time between the classes. Red means the drive is longer than that.
              Needs "Show on map" to find the addresses. Use the pencil to change a student's name,
              address, days or times; the map updates when you save.
            </Text>
            <Box display="flex" flexDirection="column">
              {routes.map(({ day, groups }) => (
                <Box key={day} mt="0.75rem">
                  <Text fontSize="sm" fontWeight="bold" color={dayColor[day]}>
                    {fullDay[day]}
                  </Text>
                  {groups.map(({ teacher, route }) => (
                    <Box key={teacher.id} mt="0.25rem">
                      <HStack justify="space-between" mb="0.25rem">
                        <HStack gap="1">
                          <ShapeDot
                            shape={teacher.shape}
                            size={12}
                            colors={[dayColor[day]]}
                            outline="#ffffff"
                          />
                          <Text fontSize="xs" fontWeight="medium">
                            {teacher.name.trim() !== "" ? teacher.name : "Teacher"} ({route.length})
                          </Text>
                        </HStack>
                        {totalMinutes(route) > 0 && (
                          <Text fontSize="xs" color="fg.muted">
                            ~{formatDrive(totalMinutes(route))} of driving between classes
                          </Text>
                        )}
                      </HStack>
                      {route.map(({ stop, leg }, i) => (
                        <Fragment key={`${stop.item.id}-${i}`}>
                          {leg !== null && (
                            <Text
                              fontSize="xs"
                              my="0.15rem"
                              pl="0.4rem"
                              color={leg.tight ? "fg.error" : "fg.muted"}
                            >
                              ↓ {leg.minutes === 0
                                ? "same place"
                                : `~${formatDrive(leg.minutes)} drive (${leg.miles.toFixed(1)} mi)`}
                              {leg.gap !== null &&
                                ` · ${formatDrive(Math.max(0, leg.gap))} between`}
                              {leg.tight && " · tight"}
                            </Text>
                          )}
                          <HStack gap="0" align="stretch">
                            <chakra.button
                              textAlign="left"
                              flex="1"
                              p="0.4rem"
                              borderRadius="md"
                              bg={stop.item.id === selected ? "bg.emphasized" : "bg.muted"}
                              onClick={() => setSelected(stop.item.id)}
                            >
                              <HStack gap="1" align="baseline">
                                <Box
                                  w="0.6rem"
                                  h="0.6rem"
                                  borderRadius="full"
                                  bg={dayColor[day]}
                                  flexShrink={0}
                                />
                                <Text fontSize="sm" fontWeight="medium">
                                  {stop.time.start === null
                                    ? ""
                                    : `${formatSpan(stop.time.start, stop.time.end)}  `}
                                  {stop.name}
                                </Text>
                              </HStack>
                              <Text fontSize="xs" color="fg.muted">
                                {stop.item.address === "" ? "No address" : stop.item.address}
                                {stop.item.days.length > 1 &&
                                  ` · also ${stop.item.days.filter((d) => d !== day).join(", ")}`}
                              </Text>
                            </chakra.button>
                            <IconButton
                              aria-label="Edit this student"
                              title="Edit this student"
                              size="xs"
                              variant="ghost"
                              onClick={() => {
                                setSelected(stop.item.id);
                                edit(fromStudentId(stop.item.id));
                              }}
                            >
                              <LuPencil />
                            </IconButton>
                          </HStack>
                        </Fragment>
                      ))}
                    </Box>
                  ))}
                </Box>
              ))}
            </Box>
          </Box>
        )}

        <Button
          size="xs"
          variant="ghost"
          alignSelf="flex-start"
          onClick={() => {
            forgetKnown();
            forgetState(widgetId);
            setKnown({});
            setTeachers([]);
            setProspects([]);
            setHidden([]);
            setLessonText("30");
            setStatus(null);
          }}
        >
          Forget everything saved in this browser
        </Button>
      </Box>
      <Box flex="1" minW="0">
        <MapView
          circles={circles}
          dots={dots}
          selected={selected}
          onSelect={setSelected}
          fitKey={fitRun}
        />
      </Box>
    </Box>
  );
}
