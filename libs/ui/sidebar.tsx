import type { ComponentChildren, JSX } from "preact"
import { useRef, useState } from "preact/hooks"
import {
  IconCalendar,
  IconChevronDown,
  IconChevronRight,
  IconFlag,
  IconList,
  IconPlus,
  IconWrench,
} from "@spy4x/preact-icons"
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

const CONTROL =
  `h-9 w-full rounded-lg border border-subtle bg-surface text-sm text-foreground hover:border-control focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-ring)]`

/** A field's label above its control. */
function Field(
  { label, children, hint }: { label: string; children: ComponentChildren; hint?: string },
) {
  return (
    <label class="flex flex-col gap-2">
      <span class="text-[13px] font-medium">{label}</span>
      {children}
      {hint && <span class="text-xs text-muted">{hint}</span>}
    </label>
  )
}

/** A native select with an icon on the left and a chevron on the right. */
function IconSelect(
  props: {
    icon: ComponentChildren
    value: string
    onChange: (value: string) => void
    options: readonly { value: string; label: string }[]
    active?: boolean
    e2e: string
  },
) {
  return (
    <span class="relative block">
      <span
        class={`pointer-events-none absolute inset-y-0 start-3 flex items-center ${
          props.active ? `text-accent-text` : `text-muted`
        }`}
      >
        {props.icon}
      </span>
      <select
        class={`${CONTROL} cursor-pointer appearance-none ps-8 pe-8 ${
          props.active ? `border-accent bg-selected-soft text-accent-text` : ``
        }`}
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        data-e2e={props.e2e}
      >
        {props.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <IconChevronDown
        class="pointer-events-none absolute inset-y-0 end-3 my-auto size-3 text-muted"
        aria-hidden="true"
      />
    </span>
  )
}

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
      <form class="flex flex-col gap-6" onSubmit={submit} data-e2e="new-task-form">
        <div class="flex flex-col gap-1">
          <h2 class="text-[22px] font-semibold leading-tight">New task</h2>
          <p class="text-[13px] text-muted">Capture a task, then add the details.</p>
        </div>
        <Field label="Task">
          <span class="relative block">
            <IconPlus
              class="pointer-events-none absolute start-4 top-3 size-4 text-muted"
              aria-hidden="true"
            />
            <textarea
              ref={titleRef}
              class={`${CONTROL} block h-26 resize-none ps-12 pe-3 py-2 text-[15px] leading-6 placeholder:text-placeholder`}
              placeholder="What do you need to do?"
              value={title}
              aria-invalid={error ? true : undefined}
              onInput={(event) => setTitle(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === `Enter` && !event.shiftKey) void submit(event)
              }}
              data-e2e="new-task-title"
            />
          </span>
          {error && <span class="text-xs text-danger">{error}</span>}
        </Field>
        <Field label="Due date">
          <span class="relative block">
            <IconCalendar
              class="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted"
              aria-hidden="true"
            />
            <input
              type="date"
              class={`${CONTROL} ps-8 pe-3 ${due ? `` : `text-muted`}`}
              value={due}
              onInput={(event) => setDue(event.currentTarget.value)}
              data-e2e="new-task-due"
            />
          </span>
        </Field>
        <Field label="Priority">
          <IconSelect
            icon={<IconFlag class="size-4" aria-hidden="true" />}
            value={String(priority)}
            onChange={(value) => setPriority(Number(value))}
            options={PRIORITIES.map((p) => ({ value: String(p.value), label: p.label }))}
            e2e="new-task-priority"
          />
        </Field>
        {props.parents.length > 0 && (
          <Field label="Nest under" hint="Leave empty to create a top-level task.">
            <IconSelect
              icon={<span aria-hidden="true">↳</span>}
              value={parentStillThere ? parentUid : ``}
              onChange={setParentUid}
              options={[
                { value: ``, label: `None` },
                ...props.parents.map((p) => ({ value: p.uid, label: p.title })),
              ]}
              active={parentStillThere}
              e2e="new-task-parent"
            />
          </Field>
        )}
        <button
          type="submit"
          disabled={props.busy}
          class="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]"
          data-e2e="new-task-add"
        >
          <IconPlus class="size-4" aria-hidden="true" />
          Add task
        </button>
      </form>

      <nav aria-label="To do lists" class="flex flex-col gap-4 border-t border-subtle pt-6">
        <div class="flex items-center justify-between">
          <h2 class="flex items-center gap-3 text-lg font-semibold">
            <IconList class="size-5" aria-hidden="true" />
            To do lists
          </h2>
          <AppLink
            href={props.newListHref}
            navigate={props.navigate}
            aria-label="New list"
            class="flex size-7 items-center justify-center rounded-md border border-subtle text-muted hover:bg-hover hover:text-foreground"
          >
            <IconPlus class="size-4" aria-hidden="true" />
          </AppLink>
        </div>
        <ul class="-mx-2 flex flex-col gap-px" data-e2e="sidebar-lists">
          {props.links.map((link) => {
            const current = link.href === props.currentPath
            return (
              <li key={link.href}>
                <AppLink
                  href={link.href}
                  navigate={props.navigate}
                  aria-current={current ? `page` : undefined}
                  class={`flex h-8 items-center gap-4 rounded-lg px-3 text-[15px] ${
                    current ? `bg-selected-soft` : `hover:bg-hover`
                  }`}
                >
                  <span
                    class="size-2.5 shrink-0 rounded-full bg-accent"
                    style={link.color ? { backgroundColor: link.color } : undefined}
                    aria-hidden="true"
                  />
                  <span class="min-w-0 flex-1 truncate">{link.label}</span>
                  {link.count !== undefined && (
                    <span class="min-w-6 rounded-md bg-chip px-1 text-center text-xs text-muted">
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

      <div class="border-t border-subtle pt-4">
        <AppLink
          href={props.settingsHref}
          navigate={props.navigate}
          aria-current={props.currentPath === props.settingsHref ? `page` : undefined}
          class="-mx-2 flex h-10 items-center gap-3 rounded-lg px-2 text-[15px] hover:bg-hover"
        >
          <IconWrench class="size-5" aria-hidden="true" />
          <span class="flex-1">Settings</span>
          <IconChevronRight class="size-4 text-muted" aria-hidden="true" />
        </AppLink>
      </div>
    </div>
  )
}
