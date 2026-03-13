import { describe, it, expect } from 'vitest'
import { getSelectionCoordinates } from './textSelection'

describe('getSelectionCoordinates', () => {
  it('returns null when no text is selected (cursor only)', () => {
    const textarea = document.createElement('textarea')
    textarea.value = 'hello world'
    document.body.appendChild(textarea)
    textarea.selectionStart = 3
    textarea.selectionEnd = 3

    const result = getSelectionCoordinates(textarea)
    expect(result).toBeNull()

    document.body.removeChild(textarea)
  })

  it('returns coordinates when text is selected', () => {
    const textarea = document.createElement('textarea')
    textarea.value = 'hello world'
    document.body.appendChild(textarea)
    textarea.selectionStart = 0
    textarea.selectionEnd = 5

    const result = getSelectionCoordinates(textarea)
    expect(result).not.toBeNull()
    expect(result).toHaveProperty('top')
    expect(result).toHaveProperty('left')
    expect(result).toHaveProperty('bottom')

    document.body.removeChild(textarea)
  })
})
