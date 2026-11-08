/**
 * The radius map's full-screen view: load a CSV of names and addresses, give a
 * start address or cross streets and a number of miles, and see who is within
 * reach. The CSV is read here in the browser and kept only in this browser; its
 * addresses (not names) are geocoded through this app's server.
 */
import { Box, Button, chakra, HStack, IconButton, Input, Text } from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import { LuDownload, LuPlus, LuSearch, LuTrash2, LuUpload } from "react-icons/lu";
import { parseCsv, toCsv } from "../../../common/csv.ts";
import {
  addressKey,
  detectMapping,
  type Field,
  fields,
  isLookable,
  type Mapping,
  rowAddress,
  rowName,
} from "./columns.ts";
import { assess, type Assessed, type Teacher } from "./coverage.ts";
import { driveMinutes, formatDrive } from "./distance.ts";
import {
  batchSize,
  findAddresses,
  findPlace,
  forgetKnown,
  forgetState,
  loadKnown,
  loadState,
  savedProblem,
  saveKnown,
  saveState,
} from "./geocode-client.ts";
import { emptyState } from "./saved-state.ts";
import { chunks, type Known, lookupsNeeded } from "./lookups.ts";
import { type Circle, type Dot, MapView } from "./map-view.tsx";
import type { FullScreenProps } from "../../widget-kit/views.tsx";
import type { RadiusMapConfig } from "./config.ts";

const fieldNames: Readonly<Record<Field, string>> = {
  name: "Name",
  street: "Street address",
  city: "City",
  state: "State",
  zip: "Zip",
};

type Csv = {
  readonly headers: ReadonlyArray<string>;
  readonly rows: ReadonlyArray<ReadonlyArray<string>>;
};

/** A place a teacher drives from, as typed. */
type Start = {
  readonly id: number;
  readonly name: string;
  readonly text: string;
  readonly milesText: string;
};

type Search = {
  readonly teachers: ReadonlyArray<Teacher>;
  readonly unmatched: number;
};

type Tab = "in" | "out";

const startMiles = (s: Start): number => Number(s.milesText);
const milesValid = (s: Start): boolean => Number.isFinite(startMiles(s)) && startMiles(s) > 0;

const chosen = (e: React.ChangeEvent<HTMLSelectElement>): number | null =>
  e.target.value === "" ? null : Number(e.target.value);

export function RadiusMapPage({ widgetId }: FullScreenProps<RadiusMapConfig>) {
  // What was loaded last time, kept in this browser (see saved-state.ts).
  const [saved] = useState(() => loadState(widgetId));
  const [csv, setCsv] = useState<Csv | null>(
    saved.csv === null ? null : { headers: saved.csv.headers, rows: saved.csv.rows },
  );
  const [fileName, setFileName] = useState(saved.csv?.fileName ?? "");
  const [mapping, setMapping] = useState<Mapping | null>(saved.mapping);
  const [starts, setStarts] = useState<ReadonlyArray<Start>>(saved.starts);
  const [tab, setTab] = useState<Tab>("in");
  const [known, setKnown] = useState<Known>(() => loadKnown());
  const [search, setSearch] = useState<Search | null>(null);
  const [status, setStatus] = useState<{ error: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    const problem = saveState(widgetId, {
      csv: csv === null ? null : { fileName, headers: csv.headers, rows: csv.rows },
      mapping,
      starts,
    });
    setStatus((now) =>
      problem !== null ? { error: true, text: problem } : now?.text === savedProblem ? null : now
    );
  }, [widgetId, csv, fileName, mapping, starts]);

  const load = async (file: File) => {
    const rows = parseCsv(await file.text());
    const [headers, ...body] = rows;
    if (headers === undefined || body.length === 0) {
      setStatus({ error: true, text: "That file has no rows." });
      return;
    }
    setCsv({ headers, rows: body });
    setFileName(file.name);
    setMapping(detectMapping(headers));
    setSearch(null);
    setStatus(null);
  };

  const filled = starts.filter((s) => s.text.trim() !== "");
  const ready = csv !== null && mapping !== null && mapping.street !== null &&
    filled.every(milesValid) && !busy;

  const run = async () => {
    if (csv === null || mapping === null) return;
    setBusy(true);
    setSelected(null);
    const teachers: Array<Teacher> = [];
    for (const start of filled) {
      setStatus({ error: false, text: `Finding ${start.text.trim()}…` });
      const found = await findPlace(start.text.trim());
      if (!found.ok) {
        setBusy(false);
        setStatus({ error: true, text: `${start.text.trim()}: ${found.errorMessage}` });
        return;
      }
      teachers.push({
        label: start.name.trim() !== "" ? start.name.trim() : found.value.label,
        at: found.value,
        miles: startMiles(start),
      });
    }
    let nowKnown = known;
    const needed = lookupsNeeded(csv.rows.map((r) => rowAddress(r, mapping)), nowKnown);
    let done = 0;
    for (const batch of chunks(needed, batchSize)) {
      setStatus({ error: false, text: `Finding addresses… ${done} of ${needed.length}` });
      const found = await findAddresses(batch);
      if (!found.ok) {
        setBusy(false);
        setKnown(nowKnown);
        saveKnown(nowKnown);
        setStatus({ error: true, text: found.errorMessage });
        return;
      }
      nowKnown = { ...nowKnown, ...Object.fromEntries(found.value) };
      done += batch.length;
    }
    saveKnown(nowKnown);
    setKnown(nowKnown);
    const unmatched = csv.rows.filter((r) => {
      const a = rowAddress(r, mapping);
      return !isLookable(a) || nowKnown[addressKey(a)] == null;
    }).length;
    setSearch({ teachers, unmatched });
    setTab("in");
    setBusy(false);
    setStatus(null);
  };

  const results: ReadonlyArray<Assessed<{ id: number; row: ReadonlyArray<string> }>> = useMemo(
    () => {
      if (csv === null || mapping === null || search === null) return [];
      const leads = csv.rows.flatMap((row, id) => {
        const at = known[addressKey(rowAddress(row, mapping))];
        return at == null ? [] : [{ item: { id, row }, at }];
      });
      return assess(leads, search.teachers);
    },
    [csv, mapping, search, known],
  );
  const inRange = results.filter((r) => r.covered);
  const outOfRange = results.filter((r) => !r.covered);
  const shown = tab === "in" ? inRange : outOfRange;
  const anyTeachers = search !== null && search.teachers.length > 0;

  const dots: ReadonlyArray<Dot> = useMemo(
    () =>
      mapping === null ? [] : results.map((r) => ({
        id: r.item.id,
        at: r.at,
        covered: r.covered,
        label: `${rowName(r.item.row, mapping)}${
          r.nearest === null
            ? ""
            : ` (${r.nearest.miles.toFixed(1)} mi, ~${
              formatDrive(driveMinutes(r.nearest.miles))
            } from ${r.nearest.teacher.label})`
        }`,
      })),
    [results, mapping],
  );

  const circles: ReadonlyArray<Circle> = useMemo(
    () => (search?.teachers ?? []).map((t) => ({ at: t.at, miles: t.miles, label: t.label })),
    [search],
  );

  const download = () => {
    if (csv === null) return;
    const rows = [
      [
        ...csv.headers,
        "Nearest teacher",
        "Miles",
        "Est. drive minutes",
        "In range",
        "All teachers in range",
      ],
      ...shown.map((r) => [
        ...r.item.row,
        r.nearest?.teacher.label ?? "",
        r.nearest === null ? "" : r.nearest.miles.toFixed(1),
        r.nearest === null ? "" : String(driveMinutes(r.nearest.miles)),
        r.covered ? "yes" : "no",
        r.reaching
          .map((d) => `${d.teacher.label} (${d.miles.toFixed(1)} mi, ${driveMinutes(d.miles)} min)`)
          .join("; "),
      ]),
    ];
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = !anyTeachers
      ? "all-addresses.csv"
      : tab === "in"
      ? "within-range.csv"
      : "out-of-range.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Box display="flex" h="full" w="full" bg="bg" color="fg">
      <Box
        w="26rem"
        flexShrink={0}
        overflowY="auto"
        p="1.25rem"
        display="flex"
        flexDirection="column"
        gap="1rem"
        borderRightWidth="1px"
      >
        <Text fontSize="sm" color="fg.muted">
          Find the addresses in a spreadsheet that are within a distance of a place. Your file is
          read in this browser and isn't uploaded or saved on a server. Addresses are sent once to
          the US Census geocoder to find their coordinates; the coordinates are kept only in this
          browser.
        </Text>

        <Box>
          <Text fontSize="sm" fontWeight="medium" mb="1">1. Addresses (.csv)</Text>
          <Button as="label" size="sm" variant="outline" cursor="pointer">
            <LuUpload />
            {fileName === "" ? "Choose a CSV file" : fileName}
            <input
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file !== undefined) void load(file);
              }}
            />
          </Button>
          {csv !== null && <Text fontSize="xs" color="fg.muted" mt="1">{csv.rows.length} rows
          </Text>}
        </Box>

        {csv !== null && mapping !== null && (
          <Box>
            <Text fontSize="sm" fontWeight="medium" mb="1">Which column is which?</Text>
            <Box
              display="grid"
              gridTemplateColumns="auto 1fr"
              gap="0.4rem 0.75rem"
              alignItems="center"
            >
              {fields.map((field) => (
                <FieldRow
                  key={field}
                  label={fieldNames[field]}
                  headers={csv.headers}
                  value={mapping[field]}
                  onChange={(index) => setMapping({ ...mapping, [field]: index })}
                />
              ))}
            </Box>
            {mapping.street === null && (
              <Text fontSize="xs" color="fg.error" mt="1">Choose the street address column.</Text>
            )}
          </Box>
        )}

        <Box>
          <Text fontSize="sm" fontWeight="medium" mb="1">
            2. Teachers (optional)
          </Text>
          <Text fontSize="xs" color="fg.muted" mb="2">
            An address or cross streets, and how many miles that teacher will drive. Leave blank to
            show every address on the map.
          </Text>
          <Box display="flex" flexDirection="column" gap="0.4rem">
            {starts.map((s, i) => (
              <Box key={s.id} display="flex" flexDirection="column" gap="1">
                <Input
                  size="sm"
                  value={s.name}
                  placeholder="Teacher name"
                  aria-label="Teacher name"
                  onChange={(e) =>
                    setStarts(starts.map((o, j) => j === i ? { ...o, name: e.target.value } : o))}
                />
                <HStack gap="1">
                  <Input
                    size="sm"
                    flex="1"
                    value={s.text}
                    placeholder="123 Main St, Denver, CO  or  Colfax Ave & Broadway, Denver"
                    onChange={(e) =>
                      setStarts(starts.map((o, j) => j === i ? { ...o, text: e.target.value } : o))}
                  />
                  <Input
                    size="sm"
                    w="4.5rem"
                    inputMode="decimal"
                    aria-label="Miles"
                    value={s.milesText}
                    borderColor={milesValid(s) ? undefined : "red.500"}
                    onChange={(e) =>
                      setStarts(
                        starts.map((o, j) => j === i ? { ...o, milesText: e.target.value } : o),
                      )}
                  />
                  <Text fontSize="xs">mi</Text>
                  <IconButton
                    aria-label="Remove"
                    size="xs"
                    variant="ghost"
                    onClick={() => setStarts(starts.filter((_, j) => j !== i))}
                  >
                    <LuTrash2 />
                  </IconButton>
                </HStack>
              </Box>
            ))}
          </Box>
          <Button
            size="xs"
            variant="ghost"
            mt="1"
            onClick={() =>
              setStarts([
                ...starts,
                {
                  id: Math.max(-1, ...starts.map((s) => s.id)) + 1,
                  name: "",
                  text: "",
                  milesText: "10",
                },
              ])}
          >
            <LuPlus /> Add a teacher
          </Button>
          <Text fontSize="xs" color="fg.muted" mt="1">
            Distance is in a straight line. Drive times are rough estimates (roads about 30% longer
            than the line, at 30 mph), not routes or traffic.
          </Text>
        </Box>

        <HStack>
          <Button size="sm" colorPalette="blue" disabled={!ready} onClick={() => void run()}>
            <LuSearch />
            {busy
              ? "Working…"
              : filled.length === 0
              ? "Show all addresses"
              : "Find addresses in range"}
          </Button>
        </HStack>
        {status !== null && (
          <Text fontSize="sm" color={status.error ? "fg.error" : "fg.muted"}>{status.text}</Text>
        )}

        {search !== null && mapping !== null && (
          <Box>
            {anyTeachers
              ? (
                <HStack mb="1">
                  <Button
                    size="xs"
                    variant={tab === "in" ? "solid" : "outline"}
                    onClick={() => setTab("in")}
                  >
                    In range ({inRange.length})
                  </Button>
                  <Button
                    size="xs"
                    variant={tab === "out" ? "solid" : "outline"}
                    onClick={() => setTab("out")}
                  >
                    Out of range ({outOfRange.length})
                  </Button>
                </HStack>
              )
              : <Text fontSize="sm" fontWeight="medium" mb="1">{results.length} addresses</Text>}
            <HStack justify="space-between" mb="1">
              <Text fontSize="xs" color="fg.muted">
                {anyTeachers && tab === "out"
                  ? "Leads no teacher will drive to: where more teachers are needed."
                  : search.unmatched > 0
                  ? `${search.unmatched} row(s) couldn't be placed: no address found.`
                  : ""}
              </Text>
              {shown.length > 0 && (
                <Button size="xs" variant="ghost" onClick={download}>
                  <LuDownload /> CSV
                </Button>
              )}
            </HStack>
            <Box display="flex" flexDirection="column" gap="0.25rem">
              {shown.map((r) => (
                <chakra.button
                  key={r.item.id}
                  textAlign="left"
                  p="0.4rem"
                  borderRadius="md"
                  bg={r.item.id === selected ? "bg.emphasized" : "bg.muted"}
                  onClick={() => setSelected(r.item.id)}
                >
                  <Text fontSize="sm" fontWeight="medium">
                    {rowName(r.item.row, mapping)}
                    {r.nearest !== null && (
                      <chakra.span fontWeight="normal" color="fg.muted">
                        {` · ${r.nearest.miles.toFixed(1)} mi · ~${
                          formatDrive(driveMinutes(r.nearest.miles))
                        }${search.teachers.length > 1 ? ` · ${r.nearest.teacher.label}` : ""}`}
                      </chakra.span>
                    )}
                  </Text>
                  <Text fontSize="xs" color="fg.muted">
                    {Object.values(rowAddress(r.item.row, mapping)).filter((p) => p !== "").join(
                      ", ",
                    )}
                  </Text>
                </chakra.button>
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
            setCsv(null);
            setFileName("");
            setMapping(null);
            setStarts(emptyState.starts);
            setSearch(null);
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
        />
      </Box>
    </Box>
  );
}

function FieldRow(props: {
  label: string;
  headers: ReadonlyArray<string>;
  value: number | null;
  onChange: (index: number | null) => void;
}) {
  return (
    <>
      <Text fontSize="sm">{props.label}</Text>
      <chakra.select
        fontSize="sm"
        borderWidth="1px"
        borderRadius="md"
        px="2"
        py="1"
        bg="bg"
        value={props.value ?? ""}
        onChange={(e) => props.onChange(chosen(e))}
      >
        <option value="">(none)</option>
        {props.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
      </chakra.select>
    </>
  );
}
