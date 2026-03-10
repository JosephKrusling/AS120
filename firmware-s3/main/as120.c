#include "as120.h"
#include "blobs.h"
#include "constants.h"
#include "wifi.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <nvs.h>
#include <driver/gpio.h>
#include <esp_log.h>
#include <cJSON.h>
#include <esp_timer.h>

#define TAG "as120"

// Global device instance
as120_t g_as120;

void as120_log_serial(as120_t *dev, uint8_t direction, const uint8_t *data, size_t len)
{
    serial_log_t *log = &dev->serial_log;
    serial_log_entry_t *e = &log->entries[log->head];
    e->timestamp_ms = (uint32_t)(esp_timer_get_time() / 1000);
    e->direction = direction;
    e->length = len > SERIAL_LOG_DATA_MAX ? SERIAL_LOG_DATA_MAX : (uint8_t)len;
    memcpy(e->data, data, e->length);
    log->head = (log->head + 1) % SERIAL_LOG_MAX;
    if (log->count < SERIAL_LOG_MAX) log->count++;
    log->seq++;
}

// Write to UART and log the outgoing packet
static void serial_tx(as120_t *dev, const void *data, size_t len)
{
    uart_write_bytes(dev->uart_num, data, len);
    as120_log_serial(dev, 1, (const uint8_t *)data, len);
}

void as120_enqueue_action(as120_t *dev, action_t action)
{
    action_t *a = malloc(sizeof(action_t));
    *a = action;
    a->next = NULL;

    if (dev->next_action == NULL)
        dev->next_action = a;
    else
        dev->last_action->next = a;
    dev->last_action = a;
}

void as120_clear_queue(as120_t *dev)
{
    // Stop current motion
    if (dev->current_action != NULL) {
        motor_t *motor = &dev->motors[dev->current_action->motor_idx];
        stepper_stop(&motor->stepper);
        motor->stepper.target = motor->stepper.position;
        free(dev->current_action);
        dev->current_action = NULL;
        dev->active_motor_index = -1;
    }

    // Free pending actions
    action_t *a = dev->next_action;
    while (a != NULL) {
        action_t *next = a->next;
        free(a);
        a = next;
    }
    dev->next_action = NULL;
    dev->last_action = NULL;
}

void as120_process_next_action(as120_t *dev)
{
    // Check if current action is complete
    if (dev->current_action != NULL) {
        motor_t *motor = &dev->motors[dev->current_action->motor_idx];

        if (dev->current_action->target == motor->stepper.position) {
            // Action complete — set stationary current
            if (dac7574_set_current_limit(motor->dac, motor->dac_channel, motor->stepper.current_stationary) != ESP_OK)
                as120_set_fault(dev, FAULT_I2C_TRANSMIT);

            if (dev->current_action->send_ok_on_completion)
                serial_tx(dev, "ok\r", 3);

            action_t *done = dev->current_action;
            dev->current_action = NULL;
            dev->active_motor_index = -1;
            free(done);
        } else {
            return; // Still moving
        }
    }

    if (dev->next_action == NULL)
        return;

    // Disable motor interrupt while reconfiguring
    dev->enable_motor_interrupt = false;

    // Dequeue next action
    dev->current_action = dev->next_action;
    dev->next_action = dev->next_action->next;

    action_t *action = dev->current_action;

    // Resolve relative movements to absolute
    if (action->type == ACTION_INCREMENT) {
        action->target = dev->motors[action->motor_idx].stepper.position + action->target;
        action->type = ACTION_ABSOLUTE;
    } else if (action->type == ACTION_DECREMENT) {
        action->target = dev->motors[action->motor_idx].stepper.position - action->target;
        action->type = ACTION_ABSOLUTE;
    }

    motor_t *motor = &dev->motors[action->motor_idx];
    stepper_t *stepper = &motor->stepper;

    // Set motion current
    if (dac7574_set_current_limit(motor->dac, motor->dac_channel, stepper->current_motion) != ESP_OK) {
        as120_set_fault(dev, FAULT_I2C_TRANSMIT);
        return;
    }

    // Disable other motors
    for (int i = 0; i < MOTOR_COUNT; i++) {
        if (i == action->motor_idx) continue;
        tca9535_set_output_pin(dev->motors[i].gpio, dev->motors[i].gpio_pin_disabled, 1, true);
    }
    vTaskDelay(1);

    // Enable this motor
    tca9535_set_output_pin(motor->gpio, motor->gpio_pin_disabled, 0, false);
    tca9535_set_output_pin(motor->gpio, motor->gpio_pin_drv_en, 1, false);

    // Set microstepping mode
    switch (stepper->step_size) {
        case STEP_SIZE_FULL:
            tca9535_set_output_pin(motor->gpio, motor->gpio_pin_drv_m0, 0, false);
            tca9535_set_output_pin(motor->gpio, motor->gpio_pin_drv_m1, 0, true);
            break;
        case STEP_SIZE_HALF:
            tca9535_set_output_pin(motor->gpio, motor->gpio_pin_drv_m0, 0, false);
            tca9535_set_output_pin(motor->gpio, motor->gpio_pin_drv_m1, 1, true);
            break;
        case STEP_SIZE_QUARTER:
            tca9535_set_output_pin(motor->gpio, motor->gpio_pin_drv_m0, 1, false);
            tca9535_set_output_pin(motor->gpio, motor->gpio_pin_drv_m1, 1, true);
            break;
        case STEP_SIZE_EIGHTH:
            // TODO: m1=0 and m0 should float (configure as input)
            tca9535_set_output_pin(motor->gpio, motor->gpio_pin_drv_m0, 1, false);
            tca9535_set_output_pin(motor->gpio, motor->gpio_pin_drv_m1, 1, true);
            break;
        case STEP_SIZE_SIXTEENTH:
            tca9535_set_output_pin(motor->gpio, motor->gpio_pin_drv_m0, 1, false);
            tca9535_set_output_pin(motor->gpio, motor->gpio_pin_drv_m1, 0, true);
            break;
    }

    // Set movement target
    stepper->origin = stepper->position;
    stepper->target = action->target;
    dev->active_motor_index = action->motor_idx;

    // Re-enable interrupt
    dev->enable_motor_interrupt = true;
}

static bool is_line_ending(uint8_t byte)
{
    return byte == '\r' || byte == '\n';
}

void as120_handle_command(as120_t *dev, uint8_t command[4])
{
    uint32_t cmd = command[0] << 24 | command[1] << 16 | command[2] << 8 | command[3];

    // Absolute move: {motor_alt_def}'{pos_hi}{pos_lo}
    // Motor alt indices: '5'=0, '6'=1, '7'=2, '8'=3, '9'=4
    if (command[0] >= '5' && command[0] <= '9' && is_line_ending(command[3])) {
        uint8_t motor_index = command[0] - '5';
        uint16_t position = command[1] << 8 | command[2];
        action_t a = { ACTION_ABSOLUTE, motor_index, 1, position, NULL };
        as120_enqueue_action(dev, a);
        goto DONE;
    }

    // Motor commands: {motor_def}{subcmd}
    // Motor indices: '0'=0, '1'=1, '2'=2, '3'=3, '4'=4
    if (command[0] >= '0' && command[0] <= '4') {
        uint8_t motor_index = command[0] - '0';
        if (motor_index >= MOTOR_COUNT) goto NAK;

        // Query position: {motor}??{cr}
        if (command[1] == '?' && command[2] == '?' && is_line_ending(command[3])) {
            uint16_t position = dev->motors[motor_index].stepper.position;
            char response[6] = { position >> 8, position & 0xff, 0, 'o', 'k', '\r' };
            serial_tx(dev, response, 6);
            goto DONE;
        }

        // Home motor: {motor}zz{cr} or {motor}ZZ{cr}
        if ((command[1] == 'z' || command[1] == 'Z') &&
            (command[2] == 'z' || command[2] == 'Z') && is_line_ending(command[3])) {
            action_t a = { ACTION_ABSOLUTE, motor_index, 1, 0, NULL };
            as120_enqueue_action(dev, a);
            goto DONE;
        }

        // Increment: {motor}+{steps}{cr}
        if (command[1] == '+' && is_line_ending(command[3])) {
            action_t a = { ACTION_INCREMENT, motor_index, 1, command[2], NULL };
            as120_enqueue_action(dev, a);
            goto DONE;
        }

        // Decrement: {motor}-{steps}{cr}
        if (command[1] == '-' && is_line_ending(command[3])) {
            action_t a = { ACTION_DECREMENT, motor_index, 1, command[2], NULL };
            as120_enqueue_action(dev, a);
            goto DONE;
        }

        goto NAK;
    }

    // Store position: st{index}{cr} or ST{index}{cr}
    if ((command[0] == 'S' || command[0] == 's') &&
        (command[1] == 'T' || command[1] == 't') && is_line_ending(command[3])) {
        position_t p = {
            .forward_back = dev->motors[MOTOR_FORWARD_BACK].stepper.position,
            .up_down      = dev->motors[MOTOR_UP_DOWN].stepper.position,
            .right_left   = dev->motors[MOTOR_RIGHT_LEFT].stepper.position,
        };
        nvs_handle_t handle;
        if (nvs_open(STORED_POSITIONS_NAMESPACE, NVS_READWRITE, &handle) != ESP_OK) goto NAK;
        char key[5] = { 'p', 'o', 's', command[2], '\0' };
        if (nvs_set_blob(handle, key, &p, sizeof(position_t)) != ESP_OK) { nvs_close(handle); goto NAK; }
        nvs_commit(handle);
        nvs_close(handle);
        goto ACK;
    }

    // Go to stored coordinate: gc{index}{cr} or GC{index}{cr}
    if ((command[0] == 'G' || command[0] == 'g') &&
        (command[1] == 'C' || command[1] == 'c') && is_line_ending(command[3])) {
        uint8_t coord_index = command[2];

        if (coord_index == 0) {
            // Home all motors
            action_t a = { ACTION_ABSOLUTE, MOTOR_UP_DOWN, 0, 0, NULL };
            as120_enqueue_action(dev, a);
            a.motor_idx = MOTOR_FORWARD_BACK;
            as120_enqueue_action(dev, a);
            a.motor_idx = MOTOR_PLUNGER;
            as120_enqueue_action(dev, a);
            a.motor_idx = MOTOR_RIGHT_LEFT;
            a.send_ok_on_completion = 1;
            as120_enqueue_action(dev, a);
        } else {
            nvs_handle_t handle;
            if (nvs_open(STORED_POSITIONS_NAMESPACE, NVS_READWRITE, &handle) != ESP_OK) goto NAK;
            char key[5] = { 'p', 'o', 's', coord_index, '\0' };
            position_t pos;
            size_t size = sizeof(position_t);
            if (nvs_get_blob(handle, key, &pos, &size) != ESP_OK) { nvs_close(handle); goto NAK; }
            nvs_close(handle);

            action_t a = { ACTION_ABSOLUTE, MOTOR_UP_DOWN, 0, 0, NULL };
            as120_enqueue_action(dev, a);           // 1. Zero UD
            a.motor_idx = MOTOR_FORWARD_BACK;
            as120_enqueue_action(dev, a);           // 2. Zero FB
            a.motor_idx = MOTOR_RIGHT_LEFT;
            a.target = pos.right_left;
            as120_enqueue_action(dev, a);           // 3. Move RL
            a.motor_idx = MOTOR_FORWARD_BACK;
            a.target = pos.forward_back;
            as120_enqueue_action(dev, a);           // 4. Move FB
            a.motor_idx = MOTOR_UP_DOWN;
            a.target = pos.up_down;
            a.send_ok_on_completion = 1;
            as120_enqueue_action(dev, a);           // 5. Move UD
        }
        goto DONE;
    }

    // Cup sensor: cup? or CUP?
    if ((command[0] == 'C' || command[0] == 'c') &&
        (command[1] == 'U' || command[1] == 'u') &&
        (command[2] == 'P' || command[2] == 'p') && command[3] == '?') {
        // TODO: Implement cup sensor. For now always return 0.
        serial_tx(dev, "0ok\n", 4);
        goto DONE;
    }

    // Fault query: flt? or FLT?
    if (cmd == 0x666c743f || cmd == 0x464c543f) {
        char response[4] = { dev->fault_code, 'o', 'k', '\n' };
        serial_tx(dev, response, 4);
        goto DONE;
    }

    // Clear fault: fcl? or FCL?
    if (cmd == 0x66636c3f || cmd == 0x46434c3f) {
        dev->fault_code = FAULT_NONE;
        goto ACK;
    }

    // Fault detail: fdt? or FDT?
    if (cmd == 0x6664743f || cmd == 0x4644543f) {
        char response[4] = { dev->fault_code, 'o', 'k', '\n' };
        serial_tx(dev, response, 4);
        goto DONE;
    }

    // Reset: rst{cr} or RST{cr}
    if (cmd == 0x7273740d || cmd == 0x5253540d) {
        esp_restart();
    }

    // Enter Lua mode: lua{cr} or LUA{cr}
    if (cmd == 0x6c75610d || cmd == 0x4c55410d) {
        dev->input_mode = INPUT_MODE_LUA;
        serial_tx(dev,
            "Lua mode enabled. Type \"help\" for commands or \"exit()\" to return to 4-byte command mode.\nlua> ", 94);
        goto DONE;
    }

    // Read system parameters: sr{cr}{cr} or SR{cr}{cr}
    if ((command[0] == 'S' || command[0] == 's') &&
        (command[1] == 'R' || command[1] == 'r') &&
        is_line_ending(command[2]) && is_line_ending(command[3])) {
        uint8_t data[SYSTEM_PARAMETERS_LENGTH];
        read_system_parameters(data);
        serial_tx(dev, (const char *)data, SYSTEM_PARAMETERS_LENGTH);
        goto ACK;
    }

    // Write system parameters: sw{cr}{cr} or SW{cr}{cr}
    if ((command[0] == 'S' || command[0] == 's') &&
        (command[1] == 'W' || command[1] == 'w') &&
        is_line_ending(command[2]) && is_line_ending(command[3])) {
        dev->input_mode = INPUT_MODE_SYSTEM_PARAM_BLOB;
        goto ACK;
    }

    // Read method parameters: mr{page}{cr} or MR{page}{cr}
    if ((command[0] == 'M' || command[0] == 'm') &&
        (command[1] == 'R' || command[1] == 'r') && is_line_ending(command[3])) {
        uint8_t page = command[2];
        uint8_t header[2] = { 0, page };
        serial_tx(dev, (const char *)header, 2);
        uint8_t data[METHOD_PARAMETERS_LENGTH];
        memset(data, 0, METHOD_PARAMETERS_LENGTH);
        read_method_parameters(data, page);
        serial_tx(dev, (const char *)data, METHOD_PARAMETERS_LENGTH);
        goto ACK;
    }

    // Write method parameters: mw{page}{cr} or MW{page}{cr}
    if ((command[0] == 'M' || command[0] == 'm') &&
        (command[1] == 'W' || command[1] == 'w') && is_line_ending(command[3])) {
        dev->method_page_number = command[2];
        dev->input_mode = INPUT_MODE_METHOD_PARAM_BLOB;
        goto ACK;
    }

    // Legacy "enter command mode": q{cr}{cr}{cr} or Q{cr}{cr}{cr}
    if ((command[0] == 'Q' || command[0] == 'q') &&
        is_line_ending(command[1]) && is_line_ending(command[2]) && is_line_ending(command[3])) {
        goto ACK;
    }

    // Version query: vr** or VR**
    if ((command[0] == 'V' || command[0] == 'v') &&
        (command[1] == 'R' || command[1] == 'r')) {
        uint16_t maj = VERSION_MAJOR, min = VERSION_MINOR, pat = VERSION_PATCH;
        uint8_t data[6];
        memcpy(data, &maj, 2);
        memcpy(data + 2, &min, 2);
        memcpy(data + 4, &pat, 2);
        serial_tx(dev, (const char *)data, 6);
        goto ACK;
    }

    // Unrecognized
    ESP_LOGW(TAG, "Unknown command: %02x %02x %02x %02x", command[0], command[1], command[2], command[3]);
    goto NAK;

ACK:
    serial_tx(dev, "ok\r", 3);
DONE:
    return;

NAK:
    serial_tx(dev, "Error:1\n", 8);
}

void as120_set_fault(as120_t *dev, fault_code_t code)
{
    dev->fault_code = code;
    ESP_LOGE(TAG, "Fault: %d", code);
}

int as120_get_status_json(const as120_t *dev, char *buf, size_t buf_size)
{
    cJSON *root = cJSON_CreateObject();
    if (root == NULL) {
        buf[0] = '\0';
        return 0;
    }

    // Version
    char version[32];
    snprintf(version, sizeof(version), "%d.%d.%d", VERSION_MAJOR, VERSION_MINOR, VERSION_PATCH);
    cJSON_AddStringToObject(root, "version", version);

    // Fault code + message
    cJSON_AddNumberToObject(root, "fault_code", dev->fault_code);
    static const char *fault_messages[] = {
        [FAULT_NONE]         = "",
        [FAULT_HOME_SWITCH]  = "Home switch not triggered — check mechanical assembly",
        [FAULT_I2C_TRANSMIT] = "I2C transmit failed — check wiring to motor driver",
        [FAULT_I2C_RECEIVE]  = "I2C receive failed — check wiring to motor driver",
    };
    const char *fault_msg = (dev->fault_code < sizeof(fault_messages)/sizeof(fault_messages[0]))
        ? fault_messages[dev->fault_code]
        : "Unknown fault";
    cJSON_AddStringToObject(root, "fault_message", fault_msg);

    // Motors array
    cJSON *motors = cJSON_CreateArray();
    for (int i = 0; i < MOTOR_COUNT; i++) {
        const motor_t *m = &dev->motors[i];
        cJSON *motor = cJSON_CreateObject();
        cJSON_AddStringToObject(motor, "name", m->name);
        cJSON_AddNumberToObject(motor, "index", m->index);
        cJSON_AddNumberToObject(motor, "position", (double)m->stepper.position);
        cJSON_AddNumberToObject(motor, "target", (double)m->stepper.target);
        cJSON_AddBoolToObject(motor, "is_home", m->is_home);
        cJSON_AddNumberToObject(motor, "speed_min", (double)m->stepper.speed_min);
        cJSON_AddNumberToObject(motor, "speed_max", (double)m->stepper.speed_max);
        cJSON_AddNumberToObject(motor, "max_acceleration", (double)m->stepper.max_acceleration);
        cJSON_AddNumberToObject(motor, "step_size", m->stepper.step_size);
        cJSON_AddItemToArray(motors, motor);
    }
    cJSON_AddItemToObject(root, "motors", motors);

    // WiFi status
    wifi_status_t ws = wifi_get_status();
    cJSON *wifi = cJSON_CreateObject();
    cJSON_AddBoolToObject(wifi, "connected", ws.connected);
    cJSON_AddBoolToObject(wifi, "ap_mode", ws.is_ap_mode);
    cJSON_AddStringToObject(wifi, "ssid", ws.ssid);
    cJSON_AddStringToObject(wifi, "ip", ws.ip);
    cJSON_AddItemToObject(root, "wifi", wifi);

    // Action queue
    cJSON *queue = cJSON_CreateArray();
    static const char *action_type_names[] = { "absolute", "increment", "decrement" };

    // Current action (in progress)
    if (dev->current_action != NULL) {
        cJSON *item = cJSON_CreateObject();
        action_t *a = dev->current_action;
        cJSON_AddStringToObject(item, "motor", dev->motors[a->motor_idx].name);
        cJSON_AddNumberToObject(item, "motor_idx", a->motor_idx);
        cJSON_AddStringToObject(item, "type", action_type_names[a->type]);
        cJSON_AddNumberToObject(item, "target", (double)a->target);
        cJSON_AddNumberToObject(item, "position", (double)dev->motors[a->motor_idx].stepper.position);
        cJSON_AddBoolToObject(item, "active", true);
        cJSON_AddItemToArray(queue, item);
    }

    // Pending actions (up to 20)
    int pending_count = 0;
    for (action_t *a = dev->next_action; a != NULL && pending_count < 20; a = a->next, pending_count++) {
        cJSON *item = cJSON_CreateObject();
        cJSON_AddStringToObject(item, "motor", dev->motors[a->motor_idx].name);
        cJSON_AddNumberToObject(item, "motor_idx", a->motor_idx);
        cJSON_AddStringToObject(item, "type", action_type_names[a->type]);
        cJSON_AddNumberToObject(item, "target", (double)a->target);
        cJSON_AddBoolToObject(item, "active", false);
        cJSON_AddItemToArray(queue, item);
    }
    cJSON_AddItemToObject(root, "queue", queue);

    // Serial log
    cJSON *serial = cJSON_CreateObject();
    cJSON_AddNumberToObject(serial, "seq", dev->serial_log.seq);
    cJSON *serial_entries = cJSON_CreateArray();
    // Walk the ring buffer from oldest to newest
    uint16_t count = dev->serial_log.count;
    uint16_t start = (dev->serial_log.head + SERIAL_LOG_MAX - count) % SERIAL_LOG_MAX;
    for (uint16_t i = 0; i < count; i++) {
        const serial_log_entry_t *e = &dev->serial_log.entries[(start + i) % SERIAL_LOG_MAX];
        cJSON *entry = cJSON_CreateObject();
        cJSON_AddNumberToObject(entry, "t", e->timestamp_ms);
        cJSON_AddStringToObject(entry, "dir", e->direction == 0 ? "rx" : "tx");
        // Encode data as hex string
        char hex[SERIAL_LOG_DATA_MAX * 2 + 1];
        for (int j = 0; j < e->length; j++)
            snprintf(hex + j * 2, 3, "%02x", e->data[j]);
        hex[e->length * 2] = '\0';
        cJSON_AddStringToObject(entry, "hex", hex);
        cJSON_AddNumberToObject(entry, "len", e->length);
        cJSON_AddItemToArray(serial_entries, entry);
    }
    cJSON_AddItemToObject(serial, "entries", serial_entries);
    cJSON_AddItemToObject(root, "serial", serial);

    int len = 0;
    if (cJSON_PrintPreallocated(root, buf, (int)buf_size, 0)) {
        len = (int)strlen(buf);
    } else {
        // Fallback: use dynamic print
        char *printed = cJSON_PrintUnformatted(root);
        if (printed) {
            len = (int)strlen(printed);
            if ((size_t)len >= buf_size) len = (int)buf_size - 1;
            memcpy(buf, printed, len);
            buf[len] = '\0';
            free(printed);
        }
    }

    cJSON_Delete(root);
    return len;
}

bool stepper_interrupt_handler(gptimer_handle_t timer, const gptimer_alarm_event_data_t *edata, void *user_data)
{
    as120_t *dev = (as120_t *)user_data;
    if (!dev->enable_motor_interrupt || dev->active_motor_index == -1)
        return false;

    motor_t *motor = &dev->motors[dev->active_motor_index];
    gpio_set_level(motor->pin_step, 0);

    // Read home switch
#ifdef CONFIG_SIMULATE_I2C
    // Simulate: home switch triggers in a small negative zone (like a real switch).
    // During homing (moving negative), the motor enters this zone and stops.
    // During normal moves (positive), the switch is never triggered.
    motor->home_switch = (motor->stepper.position < 0);
#else
    motor->home_switch = gpio_get_level(motor->pin_home);
#endif
    if (motor->home_switch) {
        if (motor->cycles_in_switch < MAX_HOME_COUNT)
            motor->cycles_in_switch++;
        if (motor->cycles_in_switch >= MAX_HOME_COUNT)
            motor->is_home = true;
    } else {
        if (motor->is_home && motor->stepper.target != 0)
            motor->stepper.position = 0; // Zero on leaving switch
        motor->is_home = false;
        motor->cycles_in_switch = 0;
    }

    int8_t step = stepper_next_step(&motor->stepper, TIMER_INTR_US, motor->is_home);
    if (step == 0)
        return false;

    if (motor->invert_step_dir)
        step = -step;

    gpio_set_level(motor->pin_dir, step > 0 ? 1 : 0);
    gpio_set_level(motor->pin_step, 1);

    return false;
}
