# Smart Baby Monitoring System

Educational BCA182 Project 1 prototype for an RT-Spark / STM32F407 device. It includes STM32Cube HAL + FreeRTOS firmware, a FastAPI backend, an audio-classification service, an Android caregiver app, and a browser dashboard. The course assignment PDF is not included in this public repository.

> **Safety:** This classroom prototype is not a medical or safety-certified monitor and cannot replace adult supervision. Test only with a classroom fixture and licensed prerecorded audio. Never attach electronics or cables to an infant or place them in an infant sleep space.

## Current status

- Run the local preview from VS Code with **Terminal → Run Task → Start caregiver UI preview (VS Code)**, then open **Browser: Open Integrated Browser** and enter `http://localhost:4174`. The page reloads when preview files change.
- The browser dashboard starts with clearly labeled sample data and can connect to the authenticated FastAPI readings, trends, event history, and event acknowledgement endpoints. Its app bearer token stays in page memory and is cleared on reload; only the backend URL and device ID are saved in this browser.
- Use direct browser-to-API authentication only for local or trusted development. A shared/public deployment needs a server-side authenticated proxy; serve non-local APIs over HTTPS and keep the board’s device token on the device.
- The Android dashboard, History and Settings screens are implemented in Jetpack Compose. It polls the authenticated API every 15 seconds, encrypts the app token with Android Keystore, and supports event acknowledgement and optional FCM registration.
- Firmware currently provides the PlatformIO/FreeRTOS foundation and portable alert rules. Peripheral tasks remain intentionally inactive until the board, pinout, and Wi-Fi module are verified.
- The RT-Spark board is not yet available in this workspace. Pin assignments, clock configuration, Wi-Fi module capabilities, flashing, and physical sensor validation remain hardware gates.
- No Firebase project or service-account credentials are included. FCM requires the user to configure them locally.

## Live web preview

The static caregiver dashboard is hosted at [monitor.joalvergs.tech](https://monitor.joalvergs.tech). It opens in sample mode. The FastAPI backend is not hosted by this deployment, so live device readings require a separately configured backend.

## Repository layout

- `web/` — VS Code browser preview for the caregiver dashboard, history, settings, and motion states.
- `android/` — Native Kotlin Android application with Jetpack Compose.
- `backend/` — FastAPI API, SQLite persistence, event rules, and optional YAMNet inference.
- `firmware/` — STM32Cube HAL + FreeRTOS project sources and candidate board manifest.
- `docs/` — board inventory, data flow, safety/privacy, and evaluation evidence.

## Preview in VS Code

In VS Code, run **Terminal → Run Task → Start caregiver UI preview (VS Code)**. Then open **Browser: Open Integrated Browser** and enter `http://localhost:4174`.

The **Settings → Monitor connection** panel connects to the FastAPI service. The default API URL is `http://127.0.0.1:8000`; enter the configured `MONITOR_APP_TOKEN` and a device ID. The API must allow the preview origin (the default backend CORS configuration includes `http://localhost:4174` and `http://127.0.0.1:4174`). The app token is kept in page memory only; reload clears it. Click **Use sample preview** to return to the sample dashboard.

Loading, authentication/network errors, stale readings, and empty readings/events are shown explicitly. When connected, trend lines use stored readings and event acknowledgement is sent to the API. The **Simulate cry alert** control is available only in sample preview; it creates a local demo history row and sends no audio.

## Backend setup

Use Python 3.11–3.13 for the optional TensorFlow/YAMNet dependency set. The API can be installed without the ML extras; audio inference then returns an explicit unavailable state.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
```

Set unique values for `MONITOR_APP_TOKEN` and `MONITOR_DEVICE_TOKENS` in the local `.env`. Source it in the shell before starting the API:

```bash
set -a
. ./.env
set +a
MONITOR_HOST=0.0.0.0 python run.py
```

For YAMNet inference, install `requirements-ml.txt`; first model use downloads the model and its class map. The server stores sensor data and event metadata in SQLite. Audio windows are processed in memory and are not written to logs or the database.

For device and phone access over the LAN, serve the API with a locally trusted HTTPS certificate. Never use cleartext transport for audio. Configure Firebase service credentials in environment variables on the server only; never commit them.

## Firmware setup

Open this folder in VS Code with PlatformIO. The provisional manifest is only a compile target based on the assignment’s STM32F407ZGT6-compatible requirement. Confirm the actual MCU, clock, flash/RAM, pinout, upload/debug interface, and Wi-Fi module from the board revision and schematic before flashing or enabling peripherals.

```bash
pio run
pio run -t upload
pio device monitor
```

`framework = stm32cube` is required. FreeRTOS is integrated as middleware; it is not a PlatformIO framework choice. Do not use RT-Thread OS/Studio, Arduino, ESP-IDF, or RT-Thread-only drivers in final firmware.

## Android setup

Open the `android/` folder in Android Studio or build the debug APK from a terminal:

```bash
cd android
./gradlew assembleDebug
```

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. Configure the backend HTTPS URL, app bearer token, and device ID in the app's Settings screen; the token is encrypted with Android Keystore on that phone. Install the locally trusted development CA on the Android test device. To enable push delivery, add your app's `google-services.json` under `android/app/` (it is ignored by Git) and configure server-side Firebase Admin credentials on the backend. The Google services Gradle plugin is applied only when that local JSON file exists.

The API and Android app currently require HTTPS. For classroom LAN use, set up a locally trusted development certificate and trust its CA on the test phone. Do not enable cleartext HTTP or commit Firebase credentials.

## Local checks

The portable alert rules can be tested on the host without an STM32 board:

```bash
./tools/test_firmware_host.sh
```

Backend tests are in `backend/tests/`; install `backend/requirements.txt` and `pytest` before running them. Actual model accuracy, push latency, sensor readings, FreeRTOS timing, and board bring-up remain evidence to collect on configured services and hardware; see `docs/evaluation.md`.

## Evaluation and deliverables

See `docs/evaluation.md` for the required test evidence. Submission evidence must include at least 20 unseen cry and 20 non-cry examples, at least 10 end-to-end notification trials, sensor comparisons where available, FreeRTOS timing/heap/stack measurements, Wi-Fi outage/recovery behavior, unit tests, static-analysis findings, the report, and a demonstration video.
