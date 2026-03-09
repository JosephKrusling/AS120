#pragma once

#include <stdint.h>
#include <stdbool.h>

typedef enum {
    STEP_SIZE_FULL      = 1,
    STEP_SIZE_HALF      = 2,
    STEP_SIZE_QUARTER   = 3,
    STEP_SIZE_EIGHTH    = 4,
    STEP_SIZE_SIXTEENTH = 5,
} step_size_t;

typedef struct {
    uint32_t id;

    // Movement profile
    int64_t speed_min;          // steps/s
    int64_t speed_max;          // steps/s
    int64_t speed_homing;       // steps/s
    int64_t max_acceleration;   // steps/s^2
    double current_motion;      // amps
    double current_stationary;  // amps
    step_size_t step_size;

    // State
    int64_t origin;             // steps
    int64_t position;           // steps
    int64_t target;             // steps
    int64_t microsteps;         // microsteps in range (-MICROSTEPS_IN_STEP, MICROSTEPS_IN_STEP)
    int64_t micro_velocity;     // microsteps/s
} stepper_t;

stepper_t stepper_new(void);
stepper_t stepper_copy(const stepper_t *src, uint32_t id);

// Returns +1, -1, or 0 indicating step direction taken (or none).
int8_t stepper_next_step(stepper_t *s, int64_t dt_us, bool is_home);

void stepper_stop(stepper_t *s);
