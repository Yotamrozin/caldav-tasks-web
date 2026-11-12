import type { JSX } from "preact"
import { useRef, useState } from "preact/hooks"
import { IconChevronRight, IconList, IconPlus, IconWrench } from "@spy4x/preact-icons"
import { AppLink } from "./frame.tsx"

/** What the New task form hands over. `due` is a `YYYY-MM-DD` date; `priority` the iCalendar one. */
export interface NewTaskInput {
  title: string
  due?: string
  priority: number
  parentUid?: string
}

/** One entry of the sidebar's lists: a view or a list. */
export interface SidebarLink {
  label: string
  href: string
  /** The dot's colour; a view without one draws the accent. */
  color?: string
  count?: number
}

/** Props of {@link Sidebar}. */
export interface SidebarProps {
  currentPath?: string
  links: readonly SidebarLink[]
  newListHref: string
  settingsHref: string
  /** Where a new task goes, named under the button. */
  targetName?: string
  /** The open top-level tasks a new task can be nested under. */
  parents: readonly { uid: string; title: string }[]
  busy?: boolean
  /** Creates the task. Resolves `true` when it was created, so the form clears. */
  onAdd: (input: NewTaskInput) => Promise<boolean>
  navigate?: (path: string) => void
}

const PRIORITIES = [
  { value: 0, label: `None` },
  { value: 9, label: `Low` },
  { value: 5, label: `Medium` },
  { value: 1, label: `High` },
]

const FIELD =
  `min-h-11 w-full rounded-lg border border-control bg-surface px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-[var(--color-ring)]`

/** The desktop column: the New task form, the lists with their counts, and Settings. */
export function Sidebar(props: SidebarProps): JSX.Element {
  const [title, setTitle] = useState(``)
  const [due, setDue] = useState(``)
  const [priority, setPriority] = useState(0)
  const [parentUid, setParentUid] = useState(``)
  const [error, setError] = useState(``)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const parentStillThere = props.parents.some((p) => p.uid === parentUid)

  const submit = async (event?: Event) => {
    event?.preventDefault()
    if (props.busy) return
    if (!title.trim()) {
      setError(`Type what you need to do.`)
      titleRef.current?.focus()
      return
    }
    setError(``)
    const done = await props.onAdd({
      title: title.trim(),
      ...(due ? { due } : {}),
      priority,
      ...(parentStillThere && parentUid ? { parentUid } : {}),
    })
    if (done) {
      setTitle(``)
      setDue(``)
      setPriority(0)
      titleRef.current?.focus()
    }
  }

  return (
    <div class="flex flex-col gap-6">
      <form class="flex flex-col gap-4" onSubmit={submit} data-e2e="new-task-form">
        <div>
          <h2 class="text-xl font-semibold">New task</h2>
          <p class="mt-1 text-sm text-muted">Capture a task, then add the details.</p>
        </div>
        <label class="flex flex-col gap-2 text-sm font-medium">
          Task
          <textarea
            ref={titleRef}
            rows={3}
            class={`${FIELD} resize-none py-2`}
            placeholder="What do you need to do?"
            value={title}
            aria-invalid={error ? true : undefined}
            onInput={(event) => setTitle(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === `Enter` && !event.shiftKey) void submit(event)
            }}
            data-e2e="new-task-title"
          />
          {error && <span class="text-sm font-normal text-danger">{error}</span>}
        </label>
        <label class="flex flex-col gap-2 text-sm font-medium">
          Due date
          <input
            type="date"
            class={FIELD}
            value={due}
            onInput={(event) => setDue(event.currentTarget.value)}
            data-e2e="new-task-due"
          />
        </label>
        <label class="flex flex-col gap-2 text-sm font-medium">
          Priority
          <select
            class={FIELD}
            value={String(priority)}
            onChange={(event) => setPriority(Number(event.currentTarget.value))}
            data-e2e="new-task-priority"
          >
            {PRIORITIES.map((p) => <option key={p.value} value={String(p.value)}>{p.label}
            </option>)}
          </select>
        </label>
        {props.parents.length > 0 && (
          <label class="flex flex-col gap-2 text-sm font-medium">
            Nest under
            <select
              class={`${FIELD} ${
                parentStillThere ? `border-accent bg-selected-soft text-accent-text` : ``
              }`}
              value={parentStillThere ? parentUid : ``}
              onChange={(event) => setParentUid(event.currentTarget.value)}
              data-e2e="new-task-parent"
            >
              <option value="">None</option>
              {props.parents.map((p) => <option key={p.uid} value={p.uid}>{p.title}</option>)}
            </select>
            <span class="text-xs font-normal text-muted">
              Leave empty to create a top-level task.
            </span>
          </label>
        )}
        <button
          type="submit"
          disabled={props.busy}
          class="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]"
          data-e2e="new-task-add"
        >
          <IconPlus class="size-4" aria-hidden="true" />
          Add task
        </button>
        {props.targetName && <p class="-mt-2 text-xs text-muted">Added to {props.targetName}</p>}
      </form>

      <nav aria-label="To do lists" class="flex flex-col gap-2 border-t border-subtle pt-6">
        <div class="flex items-center justify-between">
          <h2 class="flex items-center gap-2 text-lg font-semibold">
            <IconList class="size-5" aria-hidden="true" />
            To do lists
          </h2>
          <AppLink
            href={props.newListHref}
            navigate={props.navigate}
            aria-label="New list"
            class="flex size-9 items-center justify-center rounded-lg border border-subtle hover:bg-hover"
          >
            <IconPlus class="size-4" aria-hidden="true" />
          </AppLink>
        </div>
        <ul class="flex flex-col gap-1" data-e2e="sidebar-lists">
          {props.links.map((link) => {
            const current = link.href === props.currentPath
            return (
              <li key={link.href}>
                <AppLink
                  href={link.href}
                  navigate={props.navigate}
                  aria-current={current ? `page` : undefined}
                  class={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-base hover:bg-hover ${
                    current ? `bg-selected-soft font-medium` : ``
                  }`}
                >
                  <span
                    class="size-3 shrink-0 rounded-full bg-accent"
                    style={link.color ? { backgroundColor: link.color } : undefined}
                    aria-hidden="true"
                  />
                  <span class="min-w-0 flex-1 truncate">{link.label}</span>
                  {link.count !== undefined && (
                    <span class="rounded-md bg-track px-2 text-xs text-muted">
                      {link.count}
                      <span class="sr-only">{link.count === 1 ? ` open task` : ` open tasks`}</span>
                    </span>
                  )}
                </AppLink>
              </li>
            )
          })}
        </ul>
      </nav>

      <AppLink
        href={props.settingsHref}
        navigate={props.navigate}
        aria-current={props.currentPath === props.settingsHref ? `page` : undefined}
        class="flex min-h-11 items-center gap-3 border-t border-subtle px-3 pt-4 text-base hover:text-accent-text"
      >
        <IconWrench class="size-5" aria-hidden="true" />
        <span class="flex-1">Settings</span>
        <IconChevronRight class="size-4 text-muted" aria-hidden="true" />
      </AppLink>
    </div>
  )
}
