import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CollapsibleSection from './CollapsibleSection'

describe('CollapsibleSection', () => {
  it('renders children when open (default)', () => {
    render(
      <CollapsibleSection title="Test Section">
        <p>Section content</p>
      </CollapsibleSection>
    )
    expect(screen.getByText('Section content')).toBeInTheDocument()
  })

  it('hides children when defaultOpen is false', () => {
    render(
      <CollapsibleSection title="Test Section" defaultOpen={false}>
        <p>Hidden content</p>
      </CollapsibleSection>
    )
    expect(screen.getByText('Hidden content')).not.toBeVisible()
  })

  it('toggles children visibility on click', async () => {
    const user = userEvent.setup()
    render(
      <CollapsibleSection title="Test Section">
        <p>Toggled content</p>
      </CollapsibleSection>
    )

    expect(screen.getByText('Toggled content')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /test section/i }))
    expect(screen.getByText('Toggled content')).not.toBeVisible()

    await user.click(screen.getByRole('button', { name: /test section/i }))
    expect(screen.getByText('Toggled content')).toBeVisible()
  })

  it('displays count when provided', () => {
    render(
      <CollapsibleSection title="Items" count={5}>
        <p>Content</p>
      </CollapsibleSection>
    )
    expect(screen.getByText(/Items \(5\)/)).toBeInTheDocument()
  })

  it('omits count when not provided', () => {
    render(
      <CollapsibleSection title="Items">
        <p>Content</p>
      </CollapsibleSection>
    )
    expect(screen.getByText('Items')).toBeInTheDocument()
    expect(screen.queryByText(/\(/)).not.toBeInTheDocument()
  })

  it('sets aria-expanded correctly', async () => {
    const user = userEvent.setup()
    render(
      <CollapsibleSection title="Test Section">
        <p>Content</p>
      </CollapsibleSection>
    )

    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-expanded', 'true')

    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  it('applies error variant styling', () => {
    render(
      <CollapsibleSection title="Errors" variant="error">
        <p>Error content</p>
      </CollapsibleSection>
    )
    const button = screen.getByRole('button')
    expect(button.className).toContain('text-red-800')
  })
})
