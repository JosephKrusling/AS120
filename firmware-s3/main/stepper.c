#include "stepper.h"
#include "constants.h"
#include <stdlib.h>
#include <string.h>

stepper_t stepper_new(void)
{
    stepper_t s = {
        .id = 0,
        .origin = 0,
        .position = 0,
        .target = 0,
        .microsteps = 0,
        .micro_velocity = 0,
        .speed_min = 10,
        .speed_homing = 100,
        .speed_max = 5000,
        .max_acceleration = 500,
        .current_motion = 0.6,
        .current_stationary = 0.5,
        .step_size = STEP_SIZE_SIXTEENTH,
    };
    return s;
}

stepper_t stepper_copy(const stepper_t *src, uint32_t id)
{
    stepper_t copy = *src;
    copy.id = id;
    return copy;
}

int8_t stepper_next_step(stepper_t *s, int64_t dt_us, bool is_home)
{
    int64_t delta = s->target - s->position;
    int64_t steps_to_target = llabs(delta);
    int8_t dir_to_target = delta > 0 ? 1 : -1;

    // Homing: target==0 means "drive toward home switch"
    if (s->target == 0) {
        dir_to_target = -1;
        if (is_home) {
            s->microsteps = 0;
            s->micro_velocity = 0;
            s->position = 0;
            return 0;
        }
    }

    int8_t dir_of_motion = s->micro_velocity >= 0 ? 1 : -1;

    // Stopping distance: v^2 / (2*a)
    int64_t v = s->micro_velocity / MICROSTEPS_IN_STEP;
    int64_t stopping_distance = v * v / (2 * s->max_acceleration);

    if (steps_to_target == 0) {
        if (s->target != 0) {
            s->micro_velocity = 0;
            s->microsteps = 0;
            return 0;
        }
    } else if (steps_to_target <= stopping_distance && dir_to_target == dir_of_motion) {
        // Decelerate to avoid overshooting
        s->micro_velocity -= dt_us * s->max_acceleration * dir_of_motion;
    } else {
        // Accelerate toward target
        s->micro_velocity += dt_us * s->max_acceleration * dir_to_target;
    }

    // Clamp to max speed
    int64_t speed_limit = s->speed_max * MICROSTEPS_IN_STEP;
    if (s->micro_velocity > speed_limit)
        s->micro_velocity = speed_limit;
    else if (s->micro_velocity < -speed_limit)
        s->micro_velocity = -speed_limit;

    // Enforce minimum speed
    if (llabs(s->micro_velocity) < s->speed_min * MICROSTEPS_IN_STEP)
        s->micro_velocity = s->speed_min * MICROSTEPS_IN_STEP * dir_to_target;

    // Accumulate microsteps and emit whole steps
    s->microsteps += s->micro_velocity * dt_us / MICROSECONDS_IN_SECOND;
    if (llabs(s->microsteps) >= MICROSTEPS_IN_STEP) {
        int8_t step_dir = s->microsteps > 0 ? 1 : -1;
        s->microsteps -= step_dir * MICROSTEPS_IN_STEP;
        s->position += step_dir;
        return step_dir;
    }
    return 0;
}

void stepper_stop(stepper_t *s)
{
    s->microsteps = 0;
    s->micro_velocity = 0;
}
