import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LatexRenderer from './LatexRenderer'

describe('LatexRenderer', () => {
  it('shows placeholder text when value is empty', () => {
    render(<LatexRenderer value="" />)
    expect(screen.getByText('Processed output will appear here.')).toBeInTheDocument()
  })

  it('renders plain text without LaTeX', () => {
    render(<LatexRenderer value="Hello world" />)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('renders inline LaTeX with KaTeX markup', () => {
    const { container } = render(<LatexRenderer value="The formula $x^2$ is nice" />)
    // KaTeX renders into spans with class "katex"
    expect(container.querySelector('.katex')).not.toBeNull()
    // The surrounding text should still be present
    expect(screen.getByText(/The formula/)).toBeInTheDocument()
    expect(screen.getByText(/is nice/)).toBeInTheDocument()
  })

  it('renders display LaTeX with KaTeX markup', () => {
    const { container } = render(<LatexRenderer value="Before $$E = mc^2$$ After" />)
    expect(container.querySelector('.katex-display')).not.toBeNull()
  })

  it('preserves newlines as line breaks', () => {
    const { container } = render(<LatexRenderer value={"Line one\nLine two"} />)
    const brs = container.querySelectorAll('br')
    expect(brs.length).toBeGreaterThanOrEqual(1)
  })

  it('applies custom className', () => {
    const { container } = render(<LatexRenderer value="text" className="custom-class" />)
    expect(container.querySelector('.custom-class')).not.toBeNull()
  })
})
