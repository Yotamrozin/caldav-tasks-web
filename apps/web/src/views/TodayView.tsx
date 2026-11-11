import { useNow } from "@spy4x/preact-signals/now"
import { useEffect } from "preact/hooks"
import { useLocation } from "wouter-preact"
import { todayView } from "@spy4x/platform/universal/ical-tasks-view"
import { TodayScreen } from "@ui/today-screen.tsx"
import { calendarsLoaded } from "../state/calendars.ts"
import { taskLists } from "../state/task-lists.ts"
import { tasks } from "../state/tasks.ts"
import { listPath, taskPath } from "../routes.ts"
import { browserZone } from "./clock.ts"
import { completeWithUndo } from "./task-actions.ts"
import { useQuickAdd } from "./use-quick-add.ts"

/** The list the app opens on, by name. The Today tab still shows Today once the app is open. */
const HOME_LIST = `daily`
/** True once the first visit has had its chance to open the home list, or when it started elsewhere. */
let homeHandled = globalThis.location?.pathname !== `/`

/** Today, wired: what is overdue or due today, with a quick add that dates the task today. */
export function TodayView() {
  const [, navigate] = useLocation()
  const quickAdd = useQuickAdd({ dueToday: true })
  const zone = browserZone()
  const now = useNow({ zone }).value
  const { overdue, today } = todayView(tasks.value, now, zone)
  useEffect(() => {
    if (homeHandled || !calendarsLoaded.value) return
    homeHandled = true
    const home = taskLists.value.find((list) => list.name.trim().toLowerCase() === HOME_LIST)
    if (home) navigate(listPath(home), { replace: true })
  }, [calendarsLoaded.value])
  return (
    <TodayScreen
      overdue={overdue}
      today={today}
      lists={taskLists.value}
      zone={zone}
      now={now}
      loading={!calendarsLoaded.value}
      onComplete={(task, done) => void completeWithUndo(task, done)}
      onOpen={(task) => navigate(taskPath(task))}
      onQuickAdd={(parsed) => void quickAdd.add(parsed)}
      quickAddBusy={quickAdd.busy.value}
    />
  )
}
