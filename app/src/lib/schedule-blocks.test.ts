import { strict as assert } from 'node:assert'
import test from 'node:test'
import { buildBlockOccurrences } from './schedule-blocks.ts'

test('gera recorrência semanal em dois dias selecionados', () => {
  const occurrences = buildBlockOccurrences(
    new Date('2026-09-01T09:00:00'),
    new Date('2026-09-01T10:00:00'),
    { unit: 'week', interval: 1, weekdays: [2, 4], ends: 'occurrences', endDate: null, occurrenceCount: 4 },
  )

  assert.deepEqual(occurrences.map((item) => item.start.toISOString().slice(0, 10)), ['2026-09-01', '2026-09-03', '2026-09-08', '2026-09-10'])
})
