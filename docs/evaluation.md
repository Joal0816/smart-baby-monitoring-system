# Evaluation Plan and Evidence

Record actual measured results; do not substitute design expectations for test evidence.

| Area | Minimum evidence |
|---|---|
| Audio classifier | At least 20 unseen cry and 20 unseen background examples, with speech/music/household-noise/silence confusers; source, license, balance, counts, conditions, confusion matrix, precision, recall, F1, false alarms, failures |
| End-to-end alert | At least 10 triggered trials; capture-to-notification latency and successful/failed deliveries |
| Sensors | Timestamped temperature, humidity, light, proximity, and device-motion/tilt under controlled changes; reference comparison and limitations |
| Real-time firmware | Concurrent task periods, scheduling, heap use, stack high-water marks, worst observed latency, dropped-buffer counts |
| Connectivity | Wi-Fi disconnection/recovery, device fault state, local alerts, queue behavior, and post-recovery event handling |
| Android UI | History/search, stale-data age, acknowledgement, reset/restart, API errors, normal/alert/fault states, large text, dark theme, reduced motion |
| Software quality | Unit tests for event and data handling, static-analysis findings, API authentication/input tests, logs |

## Safe test method

Use a classroom fixture and prerecorded audio with recorded source/license details. Do not attach electronics/cables to an infant or place them in a sleep space. Do not describe the prototype as a medical or safety device.

## Results template

| Metric | Result | Conditions / notes |
|---|---|---|
| Cry precision / recall / F1 | TBD | Held-out test set required |
| False alerts / missed cries | TBD | List examples |
| Capture-to-notification latency | TBD | Include trial count and p50/p95 |
| FreeRTOS heap / minimum stack | TBD | Board and build config required |
| Worst observed task latency | TBD | Include measurement method |
| Wi-Fi recovery and queued events | TBD | Hardware trial required |
