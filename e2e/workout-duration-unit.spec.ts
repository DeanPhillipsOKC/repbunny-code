import { test, expect } from '@playwright/test'
import { formatWorkoutLength, workoutMinutes } from '../src/lib/workoutDuration'

// Issue #266: the length shown on Workout log cards,.

const START = '2026-10-07T17:00:00.000Z'

test('workoutMinutes rounds to whole minutes and skips missing or odd finish times', () => {
  expect(workoutMinutes(START, '2026-10-07T17:52:10.000Z')).toBe(52)
  expect(workoutMinutes(START, '2026-10-07T17:00:05.000Z')).toBe(1)
  expect(workoutMinutes(START, null)).toBeNull()
  expect(workoutMinutes(START, undefined)).toBeNull()
  expect(workoutMinutes(START, '2026-10-07T16:00:00.000Z')).toBeNull()
  expect(workoutMinutes(START, 'nonsense')).toBeNull()
})

test('formatWorkoutLength switches to hours from 60 minutes', () => {
  expect(formatWorkoutLength(52)).toBe('52 min')
  expect(formatWorkoutLength(60)).toBe('1 h')
  expect(formatWorkoutLength(65)).toBe('1 h 5 min')
})
