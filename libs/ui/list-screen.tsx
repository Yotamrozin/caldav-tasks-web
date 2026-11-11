import type { JSX } from "preact"
import { IconCheckCircle, IconFunnel } from "@spy4x/preact-icons"
import { DropdownItem } from "@spy4x/preact-ui/dropdown"
import { PageHeader } from "@spy4x/preact-ui/page-header"
import { Select } from "@spy4x/preact-ui/input"
import { ToggleChips } from "@spy4x/preact-ui/toggle-chips"
import { isOpen, type Task, type TaskList } from "@spy4x/time/ical-tasks-model"
import { buildTree, SortMode, sortTasks } from "@spy4x/platform/universal/ical-tasks-view"
import { PATHS } from "./frame.tsx"
import type { QuickAddResult } from "@spy4x/platform"
import { QuickAdd } from "@spy4x/preact-ui/quick-add"
import { FocusKeeper } from "./task-focus.tsx"
import { EmptyBody, LoadingBody, ScreenLayout } from "./task-screen.tsx"
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
  /** Creates a task in this list. */
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
  Hidden = `hidden`,
  Today = `today`,
  Week = `week`,
  All = `all`,
}

const COMPLETED_OPTIONS = [
  { value: CompletedRange.Hidden, label: `Hidden` },
  { value: CompletedRange.Today, label: `Today` },
  { value: CompletedRange.Week, label: `Last 7 days` },
  { value: CompletedRange.All, label: `All time` },
]

/** When the task was completed: its `COMPLETED` line, which RFC 5545 says is UTC. */
export function completedAt(task: Pick<Task, `ics`>): Date | undefined {
  const m = /^COMPLETED[^:\r\n]*:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/m.exec(task.ics)
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : undefined
}

/** `YYYY-MM-DD` of `date` in `zone`, which sorts as text. */
const dayIn = (date: Date, zone: string) => date.toLocaleDateString(`en-CA`, { timeZone: zone })

/**
 * Whether a finished task falls in `range`: completed on today's date, or on one of the last seven
 * dates, in `zone`. A finished task with no completion time (a cancelled one) shows only under All.
 */
export function inCompletedRange(task: Task, range: CompletedRange, now: Date, zone: string) {
  if (range === CompletedRange.All) return true
  if (range === CompletedRange.Hidden) return false
  const at = completedAt(task)
  if (!at) return false
  const from = range === CompletedRange.Today ? now : new Date(now.getTime() - 6 * 86_400_000)
  return dayIn(at, zone) >= dayIn(from, zone)
}

/** The tags the tasks carry, each once, in alphabetical order. */
function tagsOf(tasks: readonly Task[]): string[] {
  return [...new Set(tasks.flatMap((task) => task.tags))].sort((a, b) => a.localeCompare(b))
}

/**
 * One list: its tasks as a tree with subtasks, a sort menu, tag filter chips and "Show completed".
 * Quick add creates a task in this list. Renaming, recolouring and deleting live in "More actions".
 *
 * Sorting and filtering are the screen's, so a caller keeps only the choices (`sort`, `activeTags`,
 * `showCompleted`), which it can hold in the URL.
 */
export function ListScreen(props: ListScreenProps): JSX.Element {
  const { list, tasks, zone } = props
  // A pressed chip stays even when no shown task carries its tag, so the person can still clear it.
  const finished = tasks
    .filter((task) =>
      !isOpen(task) && inCompletedRange(task, props.completedRange, props.now, zone)
    )
    .sort((a, b) => (completedAt(b)?.getTime() ?? 0) - (completedAt(a)?.getTime() ?? 0))
  const allTags = [
    ...new Set([...tagsOf([...tasks.filter(isOpen), ...finished]), ...props.activeTags]),
  ].sort((a, b) => a.localeCompare(b))
  const tagged = (task: Task) =>
    props.activeTags.length === 0 || task.tags.some((tag) => props.activeTags.includes(tag))
  const shown = tasks.filter((task) => isOpen(task) && tagged(task))
  const nodes = buildTree(sortTasks(shown, props.sort, zone), zone)
  const done = finished.filter(tagged)
  const hasMenu = props.onRename || props.onChangeColor || props.onDelete

  const menu = hasMenu
    ? (
      <>
        {props.onRename && <DropdownItem onClick={props.onRename}>Rename list</DropdownItem>}
        {props.onChangeColor && (
          <DropdownItem onClick={props.onChangeColor}>Change colour</DropdownItem>
        )}
        {props.onDelete && <DropdownItem danger onClick={props.onDelete}>Delete list</DropdownItem>}
      </>
    )
    : undefined

  return (
    <ScreenLayout
      header={
        <PageHeader
          title={list.name}
          subtitle={`${list.openCount} open`}
          back={{ href: PATHS.lists, label: `Lists` }}
          navigate={props.navigate}
          mark={
            <span
              class="size-3 shrink-0 rounded-full bg-track"
              style={list.color ? { backgroundColor: list.color } : undefined}
              aria-hidden="true"
            />
          }
          menu={menu}
        />
      }
      quickAdd={
        <QuickAdd
          onAdd={props.onQuickAdd}
          zone={props.zone}
          busy={props.quickAddBusy}
          label="New task"
          placeholder="Add a task"
          labels={{ submit: "Add task", noTitle: "Add a title to create the task" }}
          hint={`Added to ${list.name}`}
        />
      }
    >
      {props.loading
        ? <LoadingBody label={`Loading ${list.name}`} />
        : (
          <div class="flex flex-col gap-4">
            {tasks.length > 0 && (
              <div class="flex flex-col gap-3" data-e2e="list-controls">
                <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <label class="flex items-center gap-2 text-sm text-muted">
                    <span>Sort by</span>
                    <Select
                      aria-label="Sort by"
                      class="min-h-11 w-auto"
                      options={SORT_OPTIONS}
                      value={props.sort}
                      onChange={(event) =>
                        props.onSortChange(Number(event.currentTarget.value) as SortMode)}
                      data-e2e="sort"
                    />
                  </label>
                  <label class="flex items-center gap-2 text-sm text-muted">
                    <span>Completed</span>
                    <Select
                      aria-label="Completed"
                      class="min-h-11 w-auto"
                      options={COMPLETED_OPTIONS}
                      value={props.completedRange}
                      onChange={(event) =>
                        props.onCompletedRangeChange(
                          event.currentTarget.value as CompletedRange,
                        )}
                      data-e2e="completed-range"
                    />
                  </label>
                </div>
                {allTags.length > 0 && (
                  <ToggleChips
                    label="Filter by tag"
                    options={allTags.map((tag) => ({ value: tag, label: `#${tag}` }))}
                    value={[...props.activeTags]}
                    onChange={props.onActiveTagsChange}
                  />
                )}
              </div>
            )}
            {tasks.length === 0
              ? (
                <EmptyBody
                  title="No tasks yet"
                  description="Type a title in the field and press Enter."
                  icon={<IconCheckCircle class="size-5" />}
                />
              )
              : nodes.length === 0 && done.length === 0
              ? (
                <EmptyBody
                  title={props.activeTags.length > 0 ? `No task has these tags` : `All done`}
                  description={props.activeTags.length > 0
                    ? `Clear a tag filter to see more.`
                    : `Choose a longer time under Completed to see finished tasks.`}
                  icon={<IconFunnel class="size-5" />}
                />
              )
              : (
                <>
                  {nodes.length > 0 && (
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
                  )}
                  {done.length > 0 && (
                    <section class="flex flex-col gap-2" data-e2e="completed-section">
                      <h2 class="text-sm font-medium text-muted">Completed · {done.length}</h2>
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
                    </section>
                  )}
                </>
              )}
          </div>
        )}
    </ScreenLayout>
  )
}
