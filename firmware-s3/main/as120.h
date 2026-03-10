#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <driver/gpio.h>
#include <driver/uart.h>
#include <driver/gptimer_types.h>
#include "constants.h"
#include "stepper.h"
#include "drivers/dac7574.h"
#include "drivers/tca9535.h"

// === Motor indices
typedef enum {
    MOTOR_FORWARD_BACK = 0,
    MOTOR_UP_DOWN      = 1,
    MOTOR_PLUNGER      = 2,
    MOTOR_RIGHT_LEFT   = 3,
    MOTOR_COUNT        = 4,
} motor_id_t;

// === Firmware log (captures ESP_LOG output)
#define FW_LOG_MAX 50
#define FW_LOG_MSG_MAX 128

typedef struct {
    uint32_t timestamp_ms;
    char message[FW_LOG_MSG_MAX];
} fw_log_entry_t;

typedef struct {
    fw_log_entry_t entries[FW_LOG_MAX];
    uint8_t head;
    uint8_t count;
    uint16_t seq;
} fw_log_t;

// Global firmware log (defined in main.c, separate from device state for early init).
extern fw_log_t g_fw_log;

// === Serial log
#define SERIAL_LOG_MAX 64
#define SERIAL_LOG_DATA_MAX 8

typedef struct {
    uint32_t timestamp_ms;  // millis since boot
    uint8_t  direction;     // 0 = RX, 1 = TX
    uint8_t  length;
    uint8_t  data[SERIAL_LOG_DATA_MAX];
} serial_log_entry_t;

typedef struct {
    serial_log_entry_t entries[SERIAL_LOG_MAX];
    uint16_t head;    // next write index
    uint16_t count;   // total entries (capped at SERIAL_LOG_MAX)
    uint16_t seq;     // monotonic sequence number
} serial_log_t;

// === Input modes
typedef enum {
    INPUT_MODE_4BYTE            = 0,
    INPUT_MODE_LUA              = 1,
    INPUT_MODE_SYSTEM_PARAM_BLOB = 2,
    INPUT_MODE_METHOD_PARAM_BLOB = 3,
} input_mode_t;

// === Action types
typedef enum {
    ACTION_ABSOLUTE,
    ACTION_INCREMENT,
    ACTION_DECREMENT,
} action_type_t;

// A queued motor movement.
typedef struct action {
    action_type_t type;
    uint8_t motor_idx;
    uint8_t send_ok_on_completion;
    int64_t target;
    struct action *next;
} action_t;

// Completed action (stored in history ring buffer).
#define ACTION_HISTORY_MAX 20

typedef struct {
    action_type_t type;
    uint8_t motor_idx;
    int64_t target;
} action_history_entry_t;

typedef struct {
    action_history_entry_t entries[ACTION_HISTORY_MAX];
    uint8_t head;   // next write index
    uint8_t count;  // entries stored (capped at ACTION_HISTORY_MAX)
} action_history_t;

// Stored 3-axis position (for coordinate save/recall).
typedef struct {
    int64_t forward_back;
    int64_t up_down;
    int64_t right_left;
} position_t;

// Per-motor hardware + state.
typedef struct {
    char name[16];
    uint8_t index;
    gpio_num_t pin_step;
    gpio_num_t pin_dir;
    gpio_num_t pin_home;
    dac7574_t *dac;
    uint8_t dac_channel;
    tca9535_t *gpio;
    uint8_t gpio_pin_drv_nflt;
    uint8_t gpio_pin_drv_en;
    uint8_t gpio_pin_drv_m0;
    uint8_t gpio_pin_drv_m1;
    uint8_t gpio_pin_disabled;
    bool invert_step_dir;
    stepper_t stepper;
    bool home_switch;
    bool is_home;
    uint8_t cycles_in_switch;
} motor_t;

// Top-level device state.
typedef struct {
    motor_t motors[MOTOR_COUNT];
    int8_t active_motor_index;
    tca9535_t gpio_main;
    tca9535_t gpio_expansion;
    dac7574_t dac_main;
    dac7574_t dac_expansion;
    uart_port_t uart_num;
    fault_code_t fault_code;
    bool enable_motor_interrupt;
    uint8_t method_page_number;
    input_mode_t input_mode;

    // Action queue (singly-linked list)
    action_t *current_action;
    action_t *next_action;
    action_t *last_action;

    // Completed action history
    action_history_t action_history;

    // Serial packet log
    serial_log_t serial_log;
} as120_t;

// The single global device instance (defined in as120.c).
extern as120_t g_as120;

void as120_enqueue_action(as120_t *dev, action_t action);
void as120_clear_queue(as120_t *dev);
void as120_process_next_action(as120_t *dev);
void as120_handle_command(as120_t *dev, uint8_t command[4]);
void as120_set_fault(as120_t *dev, fault_code_t code);
void as120_log_serial(as120_t *dev, uint8_t direction, const uint8_t *data, size_t len);
bool stepper_interrupt_handler(gptimer_handle_t timer, const gptimer_alarm_event_data_t *edata, void *user_data);

// Generates JSON status string into provided buffer. Returns length written.
int as120_get_status_json(const as120_t *dev, char *buf, size_t buf_size);
