# Board Inventory and Bring-up Record

The RT-Spark board is not present in the current workspace. Do not fill pin assignments or mark features verified until the physical board revision and its schematic are inspected.

| Resource | Planned project function | Current status | Evidence to record |
|---|---|---|---|
| STM32F407 MCU | FreeRTOS firmware | Assignment says STM32F407; exact part to confirm | Board marking, datasheet, clock, flash/RAM, linker map |
| AHT10 | Room temperature/humidity | Listed by assignment; unverified on this unit | I²C bus/address, readout test, reference comparison |
| AP3216C | Ambient light and obstruction indication | Listed; unverified | I²C bus/address, controlled light and obstruction test |
| ICM20608 | Movement/orientation of monitor device | Listed; unverified | Bus/address, static and tilt test; never infer infant movement |
| Wi-Fi module | Secure API transport | Model and firmware unknown | Part/firmware, command set, TCP/IP, TLS, reconnect test |
| Display, LEDs, buttons, buzzer | Local readings, status, acknowledge/mute/test | Listed; exact mapping unknown | Pin table and individual HAL test |
| RTC, flash, TF storage | Time and outage metadata queue | Subject to presence verification | Capacity, driver, persistence/recovery test |
| External microphone | Required audio capture | Not selected or connected | Module, voltage/interface, sample format, noise and buffer test |

## Pin map (fill after board inspection)

| Signal | Peripheral | MCU pin | Board connector | Verified |
|---|---|---|---|---|
| UART log | USART | TBD | TBD | No |
| I²C sensor bus | I²C | TBD | TBD | No |
| Microphone sample | ADC or I²S | TBD | TBD | No |
| Wi-Fi UART/SPI | Board-specific | TBD | TBD | No |
| LED/buzzer/button | GPIO/timer | TBD | TBD | No |

## Bring-up gates

1. Confirm exact MCU and board revision against the schematic and markings.
2. Confirm external oscillator, PLL configuration, memory layout, boot mode, and upload/debug interface.
3. Build and flash a HAL serial/LED sample through PlatformIO.
4. Add FreeRTOS with one observable scheduled task and measure its period.
5. Verify each sensor/module independently before integration.
