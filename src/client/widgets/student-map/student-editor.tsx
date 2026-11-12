/** The form for editing a student by hand: name, address, and each class's day and times. */
import { Box, Button, chakra, HStack, IconButton, Input, Text } from "@chakra-ui/react";
import { useState } from "react";
import { LuPlus, LuTrash2 } from "react-icons/lu";
import { type Day, days, fullDay, sundayFirst } from "./days.ts";
import { checkDraft, type Draft } from "./edit.ts";
import type { Student } from "./report.ts";

const weekFromSunday = days.toSorted((a, b) => sundayFirst(a) - sundayFirst(b));

type Props = {
  /** Whose student this is, for the heading. */
  readonly teacherName: string;
  readonly initial: Draft;
  /** Whether it's a student already on the roll, who can be deleted. */
  readonly existing: boolean;
  readonly onSave: (student: Student) => void;
  readonly onDelete: () => void;
  readonly onCancel: () => void;
};

export function StudentEditor(
  { teacherName, initial, existing, onSave, onDelete, onCancel }: Props,
) {
  const [draft, setDraft] = useState(initial);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const checked = checkDraft(draft);

  const setClass = (i: number, change: Partial<Draft["classes"][number]>) =>
    setDraft({ ...draft, classes: draft.classes.map((c, j) => j === i ? { ...c, ...change } : c) });

  return (
    <Box p="0.6rem" borderRadius="md" borderWidth="2px" borderColor="blue.500" bg="bg.muted">
      <Text fontSize="sm" fontWeight="bold" mb="1">
        {existing ? "Edit student" : "Add a student"}
        {teacherName.trim() === "" ? "" : ` · ${teacherName}`}
      </Text>
      <Box display="flex" flexDirection="column" gap="1">
        <Input
          size="sm"
          value={draft.name}
          placeholder="Student name"
          aria-label="Student name"
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <Input
          size="sm"
          value={draft.address}
          placeholder="123 Main St Denver CO 80210"
          aria-label="Family address"
          onChange={(e) => setDraft({ ...draft, address: e.target.value })}
        />
        <Text fontSize="xs" color="fg.muted">
          Classes: the day, and when it starts and ends (like 4:15 PM). The times can be left blank.
        </Text>
        {draft.classes.map((c, i) => (
          <HStack key={i} gap="1">
            <chakra.select
              fontSize="sm"
              borderWidth="1px"
              borderRadius="md"
              px="2"
              py="1"
              bg="bg"
              aria-label="Day"
              value={c.day}
              onChange={(e) => setClass(i, { day: e.target.value as Day })}
            >
              {weekFromSunday.map((d) => <option key={d} value={d}>{fullDay[d]}</option>)}
            </chakra.select>
            <Input
              size="sm"
              w="6rem"
              value={c.start}
              placeholder="Start"
              aria-label="Start time"
              onChange={(e) => setClass(i, { start: e.target.value })}
            />
            <Text fontSize="xs">to</Text>
            <Input
              size="sm"
              w="6rem"
              value={c.end}
              placeholder="End"
              aria-label="End time"
              onChange={(e) => setClass(i, { end: e.target.value })}
            />
            <IconButton
              aria-label="Remove this class"
              size="xs"
              variant="ghost"
              onClick={() =>
                setDraft({ ...draft, classes: draft.classes.filter((_, j) => j !== i) })}
            >
              <LuTrash2 />
            </IconButton>
          </HStack>
        ))}
        <Button
          size="xs"
          variant="ghost"
          alignSelf="flex-start"
          onClick={() =>
            setDraft({
              ...draft,
              classes: [...draft.classes, {
                day: draft.classes.at(-1)?.day ?? "Mon",
                start: "",
                end: "",
              }],
            })}
        >
          <LuPlus /> Add a class
        </Button>
        {!checked.ok && (
          <Box>
            {checked.problems.map((p) => <Text key={p} fontSize="xs" color="fg.error">{p}</Text>)}
          </Box>
        )}
        <HStack justify="space-between" mt="1">
          <HStack gap="1">
            <Button
              size="sm"
              colorPalette="blue"
              disabled={!checked.ok}
              onClick={() => checked.ok && onSave(checked.student)}
            >
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
          </HStack>
          {existing && (confirmDelete
            ? <Button size="xs" colorPalette="red" onClick={onDelete}>Yes, delete</Button>
            : (
              <Button size="xs" variant="ghost" onClick={() => setConfirmDelete(true)}>
                <LuTrash2 /> Delete student
              </Button>
            ))}
        </HStack>
      </Box>
    </Box>
  );
}
