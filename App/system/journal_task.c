#include "journal_task.h"

#include "cmsis_os.h"

#include "app_health.h"
#include "log/event_journal.h"
#include "app_qspi_lock.h"

void JournalTask_Run(void const *argument)
{
    (void)argument;

    /* Ensure subsystems are ready */
    EventJournal_Init();

    app_event_t evt;

    for (;;)
    {
        AppHealth_Heartbeat(TASK_JOURNAL);

        if (EventJournal_WaitEvent(&evt, pdMS_TO_TICKS(250)) == pdTRUE)
        {
            AppQspiLock_Lock();
            EventJournal_WriteEventToFlash(&evt);
            AppQspiLock_Unlock();
        }
    }
}
