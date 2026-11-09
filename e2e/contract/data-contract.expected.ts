// Issue #415: what every repo method returns in data-contract.spec.ts, after
// its normalizing (`<stamp>` in names, `<uuid>` ids, `<day N>` timestamps,
// w1/w2 for the test's own workouts). The adapter must match it exactly. A
// deliberate change to a method's result changes it here.

export const EXPECTED_REPOS = {
  "profile": {
    "keys": [
      "default_rest_seconds",
      "height",
      "height_unit",
      "missing_weight_prompt_opt_out",
      "plates_kg",
      "plates_lb",
      "prefill_mode",
      "weight_reminder",
      "weight_unit"
    ],
    "prefill_mode": "blank",
    "default_rest_seconds": 75,
    "plates_lb": [
      45,
      25
    ]
  },
  "exerciseCreated": {
    "id": "string",
    "name": "E2E Contract Bench <stamp>",
    "is_archived": false,
    "setup_notes": null,
    "rest_seconds": null,
    "load_type": "weight",
    "tracks_distance": false,
    "tracks_incline": false,
    "tracks_level": false,
    "tracks_calories": false,
    "muscle_group": "chest",
    "also_works": [
      "arms"
    ],
    "library_id": null,
    "uses_barbell": null,
    "bar_type": null,
    "bar_custom_weight": null,
    "bar_custom_unit": null,
    "weight_step": null,
    "weight_step_unit": null,
    "rep_range_min": null,
    "rep_range_max": null,
    "push_pull": "push",
    "user_id": "string"
  },
  "exerciseListed": {
    "setup_notes": "Seat 4",
    "rest_seconds": 120,
    "uses_barbell": true,
    "also_works": [
      "arms"
    ]
  },
  "exerciseKeys": [
    "also_works",
    "bar_custom_unit",
    "bar_custom_weight",
    "bar_type",
    "id",
    "is_archived",
    "library_id",
    "load_type",
    "muscle_group",
    "name",
    "push_pull",
    "rep_range_max",
    "rep_range_min",
    "rest_seconds",
    "setup_notes",
    "tracks_calories",
    "tracks_distance",
    "tracks_incline",
    "tracks_level",
    "user_id",
    "uses_barbell",
    "weight_step",
    "weight_step_unit"
  ],
  "hasLoggedSetsBefore": false,
  "countWorkoutsBefore": 0,
  "templateCreated": {
    "name": "E2E Contract Push <stamp>",
    "is_archived": false,
    "category": null
  },
  "templateAdded": {
    "position": 0,
    "target_sets": 3,
    "exercises": {
      "name": "E2E Contract Bench <stamp>",
      "load_type": "weight"
    }
  },
  "templateRows": [
    {
      "position": 0,
      "target_sets": 3,
      "name": "E2E Contract Bench <stamp>"
    },
    {
      "position": 1,
      "target_sets": 2,
      "name": "E2E Contract Fly <stamp>"
    }
  ],
  "templateRowsSaved": [
    {
      "position": 0,
      "target_sets": null,
      "name": "E2E Contract Fly <stamp>"
    },
    {
      "position": 1,
      "target_sets": 4,
      "name": "E2E Contract Bench <stamp>"
    }
  ],
  "templateListed": {
    "name": "E2E Contract Push <stamp>",
    "category": "upper",
    "count": [
      {
        "count": 2
      }
    ],
    "refs": [
      "bench",
      "fly"
    ]
  },
  "workoutCreated": {
    "notes": "E2E Contract note <stamp>",
    "template_id": true,
    "performed_at": true
  },
  "setInserted": {
    "id": "string",
    "workout_id": true,
    "exercise_id": true,
    "set_index": 0,
    "reps": 5,
    "weight": 100,
    "weight_unit": "lb",
    "rpe": 8,
    "level": null,
    "duration_seconds": null,
    "distance": null,
    "distance_unit": null,
    "incline": null,
    "calories": null
  },
  "setWithExercise": {
    "set_index": 1,
    "exercises": {
      "name": "E2E Contract Bench <stamp>",
      "load_type": "weight"
    }
  },
  "setFound": {
    "reps": 4,
    "weight": 112.5,
    "rpe": 9
  },
  "setMissing": null,
  "workoutGot": {
    "notes": "E2E Contract edited <stamp>",
    "performed_at": true,
    "finished_at": true,
    "feel": [
      "over_8",
      "high",
      "low"
    ],
    "events": [
      {
        "type": "finished_early",
        "at": "<day -4>"
      }
    ],
    "template": {
      "name": "E2E Contract Push <stamp>"
    },
    "sets": [
      {
        "set_index": 0,
        "reps": 5,
        "weight": 100,
        "rpe": 8,
        "exercises": {
          "name": "E2E Contract Bench <stamp>",
          "load_type": "weight"
        }
      },
      {
        "set_index": 1,
        "reps": 4,
        "weight": 112.5,
        "rpe": 9,
        "exercises": {
          "name": "E2E Contract Bench <stamp>",
          "load_type": "weight"
        }
      }
    ]
  },
  "workoutMissing": null,
  "feels": [
    {
      "id": "w1",
      "performed_at": true,
      "sleep": "over_8",
      "energy": "high",
      "stress": "low"
    }
  ],
  "events": [
    {
      "id": "w1",
      "events": [
        {
          "type": "finished_early",
          "at": "<day -4>"
        }
      ]
    }
  ],
  "notes": [
    {
      "id": "w1",
      "notes": "E2E Contract edited <stamp>"
    }
  ],
  "weightedDelta": 3,
  "hasLoggedSetsAfter": true,
  "countWorkoutsAfter": 2,
  "history": [
    {
      "id": "w2",
      "template": {
        "name": "E2E Contract Push <stamp>"
      },
      "sets": [
        105
      ]
    },
    {
      "id": "w1",
      "template": {
        "name": "E2E Contract Push <stamp>"
      },
      "sets": [
        100,
        112.5
      ]
    }
  ],
  "previous": {
    "id": "w1",
    "sets": [
      100,
      112.5
    ]
  },
  "previousNone": true,
  "latestForExercise": [
    {
      "workout": "w2",
      "weight": 105,
      "exercises": {
        "name": "E2E Contract Bench <stamp>",
        "load_type": "weight"
      }
    }
  ],
  "latestForExerciseExcluding": [
    {
      "workout": "w1",
      "weight": 100
    },
    {
      "workout": "w1",
      "weight": 112.5
    }
  ],
  "latestWorkout": {
    "id": "w2",
    "sets": [
      {
        "weight": 105,
        "exercises": {
          "name": "E2E Contract Bench <stamp>",
          "load_type": "weight"
        }
      }
    ]
  },
  "datesSince": {
    "error": null,
    "countMatches": true,
    "ours": [
      "<day -4>",
      "<day 1>"
    ]
  },
  "summariesSince": {
    "error": null,
    "countMatches": true,
    "ours": [
      {
        "id": "w1",
        "performed_at": true,
        "sets": [
          {
            "reps": 5,
            "weight": 100,
            "weight_unit": "lb",
            "duration_seconds": null,
            "exercises": {
              "load_type": "weight",
              "muscle_group": "chest"
            }
          },
          {
            "reps": 4,
            "weight": 112.5,
            "weight_unit": "lb",
            "duration_seconds": null,
            "exercises": {
              "load_type": "weight",
              "muscle_group": "chest"
            }
          }
        ]
      },
      {
        "id": "w2",
        "performed_at": true,
        "sets": [
          {
            "reps": 5,
            "weight": 105,
            "weight_unit": "lb",
            "duration_seconds": null,
            "exercises": {
              "load_type": "weight",
              "muscle_group": "chest"
            }
          }
        ]
      }
    ]
  },
  "templateSessions": [
    {
      "id": "w2",
      "volume": [
        525
      ]
    },
    {
      "id": "w1",
      "volume": [
        450,
        500
      ]
    }
  ],
  "templateSessionsUpTo": [
    "w1"
  ],
  "priorSets": [
    {
      "exercise_id": "bench",
      "workout_id": "w1",
      "performed_at": true,
      "reps": 5,
      "weight": 100,
      "weight_unit": "lb",
      "level": null,
      "duration_seconds": null,
      "distance": null,
      "distance_unit": null,
      "calories": null
    },
    {
      "exercise_id": "bench",
      "workout_id": "w1",
      "performed_at": true,
      "reps": 4,
      "weight": 112.5,
      "weight_unit": "lb",
      "level": null,
      "duration_seconds": null,
      "distance": null,
      "distance_unit": null,
      "calories": null
    }
  ],
  "markers": [
    {
      "exercise_id": "bench",
      "reps": 5,
      "weight": 100,
      "weight_unit": "lb",
      "level": null,
      "workouts": {
        "performed_at": true
      }
    },
    {
      "exercise_id": "bench",
      "reps": 4,
      "weight": 112.5,
      "weight_unit": "lb",
      "level": null,
      "workouts": {
        "performed_at": true
      }
    }
  ],
  "markersForOne": [
    {
      "reps": 5,
      "weight": 100,
      "weight_unit": "lb",
      "level": null,
      "workouts": {
        "performed_at": true
      }
    },
    {
      "reps": 4,
      "weight": 112.5,
      "weight_unit": "lb",
      "level": null,
      "workouts": {
        "performed_at": true
      }
    }
  ],
  "exerciseHistory": [
    {
      "workoutId": "w2",
      "performedAt": "<day 1>",
      "templateName": "E2E Contract Push <stamp>",
      "sets": [
        {
          "id": "string",
          "reps": 5,
          "weight": 105,
          "weight_unit": "lb",
          "rpe": null,
          "level": null,
          "duration_seconds": null,
          "distance": null,
          "distance_unit": null,
          "incline": null,
          "calories": null
        }
      ]
    },
    {
      "workoutId": "w1",
      "performedAt": "<day -4>",
      "templateName": "E2E Contract Push <stamp>",
      "sets": [
        {
          "id": "string",
          "reps": 5,
          "weight": 100,
          "weight_unit": "lb",
          "rpe": 8,
          "level": null,
          "duration_seconds": null,
          "distance": null,
          "distance_unit": null,
          "incline": null,
          "calories": null
        },
        {
          "id": "string",
          "reps": 4,
          "weight": 112.5,
          "weight_unit": "lb",
          "rpe": 9,
          "level": null,
          "duration_seconds": null,
          "distance": null,
          "distance_unit": null,
          "incline": null,
          "calories": null
        }
      ]
    }
  ],
  "recentLimit": 1,
  "recentExerciseIds": [
    "bench",
    "bench",
    "bench"
  ],
  "progressSets": [
    {
      "id": "<uuid>",
      "exercise_id": "bench",
      "workout_id": "w1",
      "set_index": 0,
      "reps": 5,
      "weight": 100,
      "weight_unit": "lb",
      "rpe": 8,
      "level": null,
      "duration_seconds": null,
      "distance": null,
      "distance_unit": null,
      "incline": null,
      "calories": null,
      "performed_at": "<day -4>",
      "finished_at": true,
      "imported": false,
      "template_id": true,
      "template_name": "E2E Contract Push <stamp>"
    },
    {
      "id": "<uuid>",
      "exercise_id": "bench",
      "workout_id": "w2",
      "set_index": 0,
      "reps": 5,
      "weight": 105,
      "weight_unit": "lb",
      "rpe": null,
      "level": null,
      "duration_seconds": null,
      "distance": null,
      "distance_unit": null,
      "incline": null,
      "calories": null,
      "performed_at": "<day 1>",
      "finished_at": true,
      "imported": false,
      "template_id": true,
      "template_name": "E2E Contract Push <stamp>"
    },
    {
      "id": "<uuid>",
      "exercise_id": "bench",
      "workout_id": "w1",
      "set_index": 1,
      "reps": 4,
      "weight": 112.5,
      "weight_unit": "lb",
      "rpe": 9,
      "level": null,
      "duration_seconds": null,
      "distance": null,
      "distance_unit": null,
      "incline": null,
      "calories": null,
      "performed_at": "<day -4>",
      "finished_at": true,
      "imported": false,
      "template_id": true,
      "template_name": "E2E Contract Push <stamp>"
    }
  ],
  "merged": {
    "rows": [
      {
        "name": "E2E Contract Bench <stamp>",
        "target_sets": 4
      }
    ],
    "flyArchived": true
  },
  "afterRemove": 0,
  "afterDeleteSet": null,
  "afterDeleteWorkout": null,
  "weightCreated": {
    "weight": 181.5,
    "weight_unit": "lb",
    "recorded_at": "string"
  },
  "weightUpdated": {
    "weight": 82,
    "weight_unit": "kg",
    "recorded_at": true
  },
  "weightListed": [
    [
      "id",
      "recorded_at",
      "user_id",
      "weight",
      "weight_unit"
    ]
  ],
  "weightRemoved": false,
  "measurementCreated": {
    "unit": "in",
    "waist": 34,
    "arms": 15,
    "chest": null,
    "recorded_at": true
  },
  "measurementUpdated": {
    "unit": "cm",
    "waist": 86,
    "chest": 100,
    "arms": null
  },
  "measurementListed": [
    [
      "arms",
      "chest",
      "hips",
      "id",
      "neck",
      "recorded_at",
      "thighs",
      "unit",
      "user_id",
      "waist"
    ]
  ],
  "measurementRemoved": false
}

export const EXPECTED_BACKUP = {
  "errors": [
    {
      "id": "string",
      "occurred_at": "string",
      "kind": "error",
      "message": "E2E contract second <stamp>",
      "stack": null,
      "route": "/",
      "context": {
        "op": "contract"
      },
      "app_version": "test",
      "user_agent": "contract"
    },
    {
      "id": "string",
      "occurred_at": "string",
      "kind": "error",
      "message": "E2E contract first <stamp>",
      "stack": null,
      "route": "/",
      "context": {
        "op": "contract"
      },
      "app_version": "test",
      "user_agent": "contract"
    }
  ],
  "errorsCleared": 0,
  "afterRestore": {
    "workouts": 1,
    "sets": 1
  },
  "backupProfile": {
    "keys": [
      "default_rest_seconds",
      "height",
      "height_unit",
      "missing_weight_prompt_opt_out",
      "plates_kg",
      "plates_lb",
      "prefill_mode",
      "weight_reminder",
      "weight_unit"
    ],
    "weight_unit": "kg"
  },
  "listAllKeys": {
    "exercises": [
      [
        "also_works",
        "bar_custom_unit",
        "bar_custom_weight",
        "bar_type",
        "id",
        "is_archived",
        "library_id",
        "load_type",
        "muscle_group",
        "name",
        "push_pull",
        "rep_range_max",
        "rep_range_min",
        "rest_seconds",
        "setup_notes",
        "tracks_calories",
        "tracks_distance",
        "tracks_incline",
        "tracks_level",
        "user_id",
        "uses_barbell",
        "weight_step",
        "weight_step_unit"
      ]
    ],
    "workout_templates": [
      [
        "category",
        "id",
        "is_archived",
        "name",
        "user_id"
      ]
    ],
    "workout_template_exercises": [
      [
        "exercise_id",
        "id",
        "position",
        "target_sets",
        "template_id"
      ]
    ],
    "workouts": [
      [
        "energy",
        "events",
        "finished_at",
        "id",
        "notes",
        "performed_at",
        "sleep",
        "stress",
        "template_id",
        "user_id"
      ]
    ],
    "sets": [
      [
        "calories",
        "distance",
        "distance_unit",
        "duration_seconds",
        "exercise_id",
        "id",
        "incline",
        "level",
        "reps",
        "rpe",
        "set_index",
        "weight",
        "weight_unit",
        "workout_id"
      ]
    ],
    "body_weight_entries": [
      [
        "id",
        "recorded_at",
        "user_id",
        "weight",
        "weight_unit"
      ]
    ],
    "body_measurements": [
      [
        "arms",
        "chest",
        "hips",
        "id",
        "neck",
        "recorded_at",
        "thighs",
        "unit",
        "user_id",
        "waist"
      ]
    ]
  },
  "restoredExercise": {
    "name": "E2E Contract Squat <stamp>",
    "also_works": [
      "glutes"
    ],
    "idChanged": true
  },
  "afterMerge": {
    "workouts": 2,
    "sets": 2
  },
  "exercisesAfterMerge": 1,
  "afterReset": {
    "workouts": 0,
    "sets": 0
  },
  "exercisesAfterReset": 0,
  "weightsAfterReset": 0,
  "unitAfterReset": "kg"
}
