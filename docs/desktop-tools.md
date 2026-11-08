# Desktop tools

`system_metrics` returns actual OS memory totals/free memory, load average, uptime, and platform using Node `os`. Load average is not mislabeled as CPU utilization. Every invocation requires approval, including repeated calls in one conversation.

No application launching, process control, file search/move/delete, screen capture, sleep, shutdown, or arbitrary command execution is implemented. These require future platform adapters, explicit permission boundaries, and target-OS tests.
