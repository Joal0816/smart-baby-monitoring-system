# Project instructions

## Project context

This repository is for BCA182 Project 1, **Smart Baby Monitoring System**. The course assignment PDF is maintained outside this public repository. Consult the course copy for the original requirements; preserve the technical and safety constraints summarized below.

The goal is an educational IoT prototype using the RT-Thread RT-Spark (Spark-1), based on STM32F407, to monitor environmental readings, identify likely baby-cry events, and notify a caregiver through an Android app. The system may include embedded firmware, a backend and database, an audio classifier, a mobile app, documentation, and evaluation evidence.

## Required technical constraints

- Firmware must use STM32Cube HAL/LL with FreeRTOS and be built, flashed, and monitored through VS Code and PlatformIO.
- Configure PlatformIO with the ST STM32 platform and `framework = stm32cube`; integrate FreeRTOS as middleware. Do not use RT-Thread OS/Studio, Arduino, ESP-IDF, or RT-Thread-dependent drivers in the final firmware.
- Verify the actual board revision, MCU, clock, memory, pinout, schematic, peripherals, and upload/debug path. Do not assume another STM32 board profile or that every listed onboard resource exists or works.
- Prefer existing onboard hardware. Justify every added external module and document excluded onboard resources.
- The audio path needs an external microphone or capture module. Use at least the labels “baby crying” and “non-crying/background”; evaluate on independent examples, with a justified threshold and event-confirmation rule. Select on-device or backend inference based on measured memory, timing, throughput, and latency.
- Use authenticated, appropriately protected connectivity. Never commit credentials or secrets. Define behavior for network, sensor, queue, and storage failures; preserve essential event metadata during outages when practical.
- Show stale data and device/network faults clearly in the app. Do not present this classroom prototype as a medical or safety-certified monitor.

## Safety and claims

- Do not attach electronics or cables to an infant or place them in an infant sleep space; use a classroom fixture and prerecorded, licensed audio.
- Do not claim that proximity detects infant presence or breathing, that device motion measures infant movement or breathing, or that cry classification diagnoses a medical condition.
- Treat unavailable readings, failed services, and exhausted queues as faults, never as evidence that conditions are safe.

## Implementation and evidence

- Build incrementally: verify board setup and a scheduled FreeRTOS task first, then individual drivers, audio/classification, connectivity, backend, app, and end-to-end integration.
- Use Git throughout. Keep source, board configuration, tests, documentation, and wiring notes under version control; exclude generated `.pio` output and secrets.
- Keep setup and results reproducible. Record dependency versions, build/upload instructions, board configuration, and measured timing/resource use.
- Validate the final prototype quantitatively: unseen cry/non-cry audio examples with confusion matrix, precision/recall/F1 and failure examples; at least 10 end-to-end notification trials with latency and delivery outcomes; sensor checks against a reference where available; FreeRTOS heap/stack/timing; and Wi-Fi loss/recovery behavior.
- The final deliverables include the complete repository, project report, classifier/dataset documentation, test evidence, and a demonstration video. Attribute adapted public code and cite model/data sources.

## Repository conventions

Before adding files, inspect the workspace and preserve existing work. Prefer small, reviewable changes and document assumptions where the board or module has not yet been verified.
