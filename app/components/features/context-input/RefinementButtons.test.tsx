import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RefinementButtons from './RefinementButtons'

describe('RefinementButtons', () => {
  it('renders all four refinement buttons', () => {
    render(<RefinementButtons onRefine={() => {}} />)
    expect(screen.getByText('Elaborate')).toBeInTheDocument()
    expect(screen.getByText('Shorten')).toBeInTheDocument()
    expect(screen.getByText('Make Precise')).toBeInTheDocument()
    expect(screen.getByText('Clarify')).toBeInTheDocument()
  })

  it('calls onRefine with the correct action id when each button is clicked', async () => {
    const onRefine = vi.fn()
    render(<RefinementButtons onRefine={onRefine} />)

    await userEvent.click(screen.getByText('Elaborate'))
    expect(onRefine).toHaveBeenCalledWith('elaborate')

    await userEvent.click(screen.getByText('Shorten'))
    expect(onRefine).toHaveBeenCalledWith('shorten')

    await userEvent.click(screen.getByText('Make Precise'))
    expect(onRefine).toHaveBeenCalledWith('formalize')

    await userEvent.click(screen.getByText('Clarify'))
    expect(onRefine).toHaveBeenCalledWith('clarify')
  })
})
