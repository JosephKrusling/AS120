#pragma once

#include <driver/gpio.h>

// === Version
#define VERSION_MAJOR 1
#define VERSION_MINOR 0
#define VERSION_PATCH 0

// === Timing
#define TIMER_INTR_US 10

// === NVS Namespaces
#define STORED_POSITIONS_NAMESPACE "strd_pos"
#define SYSTEM_PARAMETERS_NAMESPACE "sys_prms"
#define METHOD_PARAMETERS_NAMESPACE "mthd_prms"

// === Homing
#define MAX_HOME_COUNT 3

// === Fault Codes
typedef enum {
    FAULT_NONE          = 0x00,
    FAULT_HOME_SWITCH   = 0x01,
    FAULT_I2C_TRANSMIT  = 0x02,
    FAULT_I2C_RECEIVE   = 0x03,
    FAULT_UNKNOWN       = 0xFF,
} fault_code_t;

// === I2C
#define I2C_TIMEOUT_MS      100
#define I2C_MAX_RETRIES     5
#define I2C_RETRY_DELAY_MS  10

// === GPIO Pin Assignments
// Target board: ESP32-S3-DevKitC-1 v1.0 with ESP32-S3-WROOM-1-N16R8 module
// (16MB flash, 8MB octal PSRAM). Bodge-wired into S2-MINI-2U PCB socket.
// On N16R8 (octal PSRAM), GPIO 26-37 are unavailable:
//   26-32: SPI flash, 33-37: PSRAM (and 33-34 not on DevKitC-1 headers)
// Motor control pins remapped to GPIO 4-7, 15 (all on J1 header).
static const gpio_num_t PIN_STEP      = GPIO_NUM_6;   // was 35, now J1 pin 6
static const gpio_num_t PIN_STEP_EXP  = GPIO_NUM_38;  // unchanged, J3 pin 10
static const gpio_num_t PIN_DIR       = GPIO_NUM_5;   // was 34, now J1 pin 5
static const gpio_num_t PIN_DIR_EXP   = GPIO_NUM_7;   // was 36, now J1 pin 7
static const gpio_num_t PIN_HOME      = GPIO_NUM_4;   // was 33, now J1 pin 4
static const gpio_num_t PIN_HOME_EXP  = GPIO_NUM_15;  // was 37, now J1 pin 8

static const gpio_num_t PIN_I2C_SDA   = GPIO_NUM_21;
static const gpio_num_t PIN_I2C_SCL   = GPIO_NUM_20;

static const gpio_num_t PIN_STATUS_LED = GPIO_NUM_48; // Many S3 devkits use GPIO48 for onboard LED

// UART0 TX/RX for legacy comms
static const gpio_num_t PIN_UART_TX   = GPIO_NUM_43;
static const gpio_num_t PIN_UART_RX   = GPIO_NUM_44;

// === Stepper math constants
#define MICROSTEPS_IN_STEP      1000000LL
#define MICROSECONDS_IN_SECOND  1000000LL
