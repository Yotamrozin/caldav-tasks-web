import type { ComponentChildren, JSX } from "preact"
import {
  IconArrowDown,
  IconArrowLeft,
  IconChevronDown,
  IconEllipsisVertical,
  IconFunnel,
} from "@spy4x/preact-icons"
import { Dropdown, DropdownItem } from "@spy4x/preact-ui/dropdown"
import { isOpen, type Task, type TaskList } from "@spy4x/time/ical-tasks-model"
import { buildTree, SortMode, sortTasks } from "@spy4x/platform/universal/ical-tasks-view"
import { PATHS } from "./frame.tsx"
import type { QuickAddResult } from "@spy4x/platform"
import { QuickAdd } from "@spy4x/preact-ui/quick-add"
import { FocusKeeper } from "./task-focus.tsx"
import { EmptyBody, LoadingBody } from "./task-screen.tsx"
import { flatNodes, TaskTree } from "./task-tree.tsx"

/** Props of {@link ListScreen}. */
export interface ListScreenProps {
  list: TaskList
  /** Every task of the list, completed ones included. The screen filters, sorts and nests them. */
  tasks: readonly Task[]
  zone: string
  now: Date
  loading?: boolean
  sort: SortMode
  onSortChange: (sort: SortMode) => void
  /**
   * A drag finished in manual order: the moved task, the tasks that share its parent as shown and
   * the index it takes among the others. Left out, rows have no drag handle.
   */
  onReorder?: (task: Task, siblings: readonly Task[], toIndex: number) => void
  /** The tags the list is narrowed to. A task shows when it has at least one of them. */
  activeTags: readonly string[]
  onActiveTagsChange: (tags: string[]) => void
  /** Which finished tasks show, in their own section below the open ones. */
  completedRange: CompletedRange
  onCompletedRangeChange: (range: CompletedRange) => void
  onComplete: (task: Task, done: boolean) => void
  onOpen: (task: Task) => void
  /** Creates a task in this list. The phone's way to add; a desktop has the sidebar's form. */
  onQuickAdd: (parsed: QuickAddResult) => void
  quickAddBusy?: boolean
  /** Follows the "back to Lists" arrow without a page load. */
  navigate?: (href: string) => void
  /** Each of these adds its item to "More actions"; a screen with none has no menu. */
  onRename?: () => void
  onChangeColor?: () => void
  onDelete?: () => void
}

const SORT_OPTIONS = [
  { value: SortMode.Manual, label: `Manual order` },
  { value: SortMode.Due, label: `Due date` },
  { value: SortMode.Priority, label: `Priority` },
  { value: SortMode.Title, label: `Title` },
]

/** Which finished tasks a list shows, by when they were completed. */
export enum CompletedRange {
  Today = `today`,
  Week = `week`,
  Month = `month`,
  All = `all`,
}

const COMPLETED_OPTIONS = [
  { value: CompletedRange.Today, label: `Today` },
  { value: CompletedRange.Week, label: `Past 7 days` },
  { value: CompletedRange.Month, label: `Past month` },
  { value: CompletedRange.All, label: `Forever` },
]

const DAYS_BACK: Record<CompletedRange, number> = {
  [CompletedRange.Today]: 0,
  [CompletedRange.Week]: 6,
  [CompletedRange.Month]: 29,
  [CompletedRange.All]: Infinity,
}

/** When the task was completed: its `COMPLETED` line, which RFC 5545 says is UTC. */
export function completedAt(task: Pick<Task, `ics`>): Date | undefined {
  const m = /^COMPLETED[^:\r\n]*:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/m.exec(task.ics)
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : undefined
}

/** `YYYY-MM-DD` of `date` in `zone`, which sorts as text. */
const dayIn = (date: Date, zone: string) => date.toLocaleDateString(`en-CA`, { timeZone: zone })

/**
 * Whether a finished task falls in `range`: completed on today's date, or on one of the last 7 or
 * 30 dates, in `zone`. A finished task with no completion time (a cancelled one) shows only under
 * Forever.
 */
export function inCompletedRange(task: Task, range: CompletedRange, now: Date, zone: string) {
  if (range === CompletedRange.All) return true
  const at = completedAt(task)
  if (!at) return false
  return dayIn(at, zone) >= dayIn(new Date(now.getTime() - DAYS_BACK[range] * 86_400_000), zone)
}

/** The tags the tasks carry, each once, in alphabetical order. */
function tagsOf(tasks: readonly Task[]): string[] {
  return [...new Set(tasks.flatMap((task) => task.tags))].sort((a, b) => a.localeCompare(b))
}

/** A count beside a section heading. */
function Count({ n }: { n: number }) {
  return <span class="rounded-md bg-track px-2 py-px text-xs font-normal text-muted">{n}</span>
}

/** A native select drawn as a quiet button: an icon, a prefix and the chosen option. */
function MenuSelect<T extends string | number>(
  props: {
    label: string
    prefix?: string
    icon?: ComponentChildren
    value: T
    options: readonly { value: T; label: string }[]
    onChange: (value: string) => void
    e2e: string
  },
): JSX.Element {
  return (
    <label class="relative inline-flex min-h-10 items-center gap-2 rounded-lg border border-subtle bg-surface ps-3 pe-2 text-sm text-foreground hover:bg-hover focus-within:outline-2 focus-within:outline-[var(--color-ring)]">
      {props.icon}
      {props.prefix && <span class="text-muted" aria-hidden="true">{props.prefix}</span>}
      <select
        aria-label={props.label}
        class="cursor-pointer appearance-none bg-transparent pe-4 outline-none"
        value={String(props.value)}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        data-e2e={props.e2e}
      >
        {props.options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
        ))}
      </select>
      <IconChevronDown class="pointer-events-none absolute end-2 size-3" aria-hidden="true" />
    </label>
  )
}

/**
 * One list: a heading with today's date, the open tasks as a tree in a card with a tag filter and
 * an order menu, and below them the finished tasks of a chosen period, newest first. A finished
 * subtask stays under its open parent, so "1 of 3 subtasks" adds up. On a phone a quick add sits
 * at the bottom; on a desktop the sidebar's New task form adds to this list.
 */
export function ListScreen(props: ListScreenProps): JSX.Element {
  const { list, tasks, zone } = props
  const openUids = new Set(tasks.filter(isOpen).map((task) => task.uid))
  // A finished subtask of an open task belongs with its parent, not in Completed.
  const inTree = (task: Task) =>
    isOpen(task) || (task.parentUid !== undefined && openUids.has(task.parentUid))
  const tagged = (task: Task) =>
    props.activeTags.length === 0 || task.tags.some((tag) => props.activeTags.includes(tag))
  const finished = tasks
    .filter((task) =>
      !inTree(task) && inCompletedRange(task, props.completedRange, props.now, zone)
    )
    .sort((a, b) => (completedAt(b)?.getTime() ?? 0) - (completedAt(a)?.getTime() ?? 0))
  const allTags = [
    ...new Set([...tagsOf([...tasks.filter(isOpen), ...finished]), ...props.activeTags]),
  ].sort((a, b) => a.localeCompare(b))
  const shown = tasks.filter((task) => inTree(task) && tagged(task))
  const nodes = buildTree(sortTasks(shown, props.sort, zone), zone)
  const done = finished.filter(tagged)
  const openShown = shown.filter(isOpen).length
  const hasMenu = props.onRename || props.onChangeColor || props.onDelete
  const today = props.now.toLocaleDateString(undefined, {
    weekday: `long`,
    month: `long`,
    day: `numeric`,
    timeZone: zone,
  })

  return (
    <div class="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-6 md:px-12 md:py-12">
      <header class="flex flex-col gap-2" data-e2e="page-header">
        <a
          href={PATHS.lists}
          aria-label="Lists"
          class="inline-flex min-h-11 w-fit items-center gap-1 text-sm text-muted md:hidden"
          onClick={(event) => {
            if (!props.navigate || event.button !== 0 || event.ctrlKey || event.metaKey) return
            event.preventDefault()
            props.navigate(PATHS.lists)
          }}
        >
          <IconArrowLeft class="size-4" aria-hidden="true" />
          Lists
        </a>
        <div class="flex items-start justify-between gap-4">
          <h1 class="flex min-w-0 items-center gap-3 text-3xl font-bold tracking-tight md:text-4xl">
            <span
              class="size-3 shrink-0 rounded-full bg-track"
              style={list.color ? { backgroundColor: list.color } : undefined}
              aria-hidden="true"
            />
            <span class="break-words">{list.name}</span>
          </h1>
          <div class="flex shrink-0 items-center gap-2">
            <p class="pt-2 text-sm text-muted max-sm:hidden">{today}</p>
            {hasMenu && (
              <Dropdown
                trigger={<IconEllipsisVertical class="size-5" aria-hidden="true" />}
                triggerClasses="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted hover:bg-hover"
                triggerLabel="More actions"
                menuLabel="More actions"
                horizontal="right"
              >
                {props.onRename && (
                  <DropdownItem onClick={props.onRename}>Rename list</DropdownItem>
                )}
                {props.onChangeColor && (
                  <DropdownItem onClick={props.onChangeColor}>Change colour</DropdownItem>
                )}
                {props.onDelete && (
                  <DropdownItem danger onClick={props.onDelete}>Delete list</DropdownItem>
                )}
              </Dropdown>
            )}
          </div>
        </div>
        <p class="text-muted">
          {list.openCount === 1 ? `1 thing to do` : `${list.openCount} things to do`}
        </p>
      </header>

      <div class="md:hidden" data-e2e="phone-quick-add">
        <QuickAdd
          onAdd={props.onQuickAdd}
          zone={props.zone}
          busy={props.quickAddBusy}
          label="New task"
          placeholder="Add a task"
          labels={{ submit: "Add task", noTitle: "Add a title to create the task" }}
          hint={`Added to ${list.name}`}
        />
      </div>

      {props.loading
        ? <LoadingBody label={`Loading ${list.name}`} />
        : tasks.length === 0
        ? (
          <EmptyBody
            title="No tasks yet"
            description="Add one with New task."
          />
        )
        : (
          <>
            <section class="flex flex-col gap-4" aria-labelledby="incomplete-heading">
              <div
                class="flex flex-wrap items-center justify-between gap-3"
                data-e2e="list-controls"
              >
                <h2 id="incomplete-heading" class="flex items-center gap-2 text-lg font-semibold">
                  Incomplete <Count n={openShown} />
                </h2>
                <div class="flex flex-wrap items-center gap-2">
                  {allTags.length > 0 && (
                    <MenuSelect
                      label="Filter by tag"
                      icon={<IconFunnel class="size-4 text-muted" aria-hidden="true" />}
                      value={props.activeTags[0] ?? ``}
                      options={[
                        { value: ``, label: `Filter` },
                        ...allTags.map((tag) => ({ value: tag, label: `#${tag}` })),
                      ]}
                      onChange={(tag) => props.onActiveTagsChange(tag ? [tag] : [])}
                      e2e="tag-filter"
                    />
                  )}
                  <MenuSelect
                    label="Sort by"
                    icon={<IconArrowDown class="size-4 text-muted" aria-hidden="true" />}
                    prefix="Order:"
                    value={props.sort}
                    options={SORT_OPTIONS}
                    onChange={(mode) => props.onSortChange(Number(mode) as SortMode)}
                    e2e="sort"
                  />
                </div>
              </div>
              {nodes.length === 0
                ? (
                  <p class="rounded-xl border border-subtle bg-surface p-6 text-muted">
                    {props.activeTags.length > 0
                      ? `No open task has this tag.`
                      : `All done. Nothing left here.`}
                  </p>
                )
                : (
                  <div class="rounded-xl border border-subtle bg-surface">
                    <FocusKeeper label="Tasks">
                      <TaskTree
                        label={`${list.name} tasks`}
                        nodes={nodes}
                        zone={zone}
                        now={props.now}
                        onComplete={props.onComplete}
                        onOpen={props.onOpen}
                        onReorder={props.sort === SortMode.Manual ? props.onReorder : undefined}
                      />
                    </FocusKeeper>
                  </div>
                )}
            </section>

            <section
              class="flex flex-col gap-4"
              aria-labelledby="completed-heading"
              data-e2e="completed-section"
            >
              <div class="flex flex-wrap items-center justify-between gap-3">
                <h2 id="completed-heading" class="flex items-center gap-2 text-lg font-semibold">
                  Completed <Count n={done.length} />
                </h2>
                <MenuSelect
                  label="Completed"
                  value={props.completedRange}
                  options={COMPLETED_OPTIONS}
                  onChange={(range) => props.onCompletedRangeChange(range as CompletedRange)}
                  e2e="completed-range"
                />
              </div>
              {done.length === 0
                ? <p class="text-sm text-muted">Nothing completed in this period.</p>
                : (
                  <FocusKeeper label="Completed tasks">
                    <TaskTree
                      label={`${list.name} completed tasks`}
                      nodes={flatNodes(done)}
                      zone={zone}
                      now={props.now}
                      onComplete={props.onComplete}
                      onOpen={props.onOpen}
                    />
                  </FocusKeeper>
                )}
            </section>
          </>
        )}
    </div>
  )
}
