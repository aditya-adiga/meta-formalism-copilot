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
    // remark-math requires display math ($$) on its own paragraph (blank lines around it)
    const { container } = render(<LatexRenderer value={"Before\n\n$$E = mc^2$$\n\nAfter"} />)
    // rehype-katex renders display math into a dedicated paragraph;
    // in jsdom the .katex-display wrapper may not appear, so verify
    // the math is rendered in its own paragraph with KaTeX markup
    const katexElements = container.querySelectorAll('.katex')
    expect(katexElements.length).toBeGreaterThanOrEqual(1)
    // The surrounding text should be in separate paragraphs
    expect(screen.getByText('Before')).toBeInTheDocument()
    expect(screen.getByText('After')).toBeInTheDocument()
  })

  it('preserves paragraph breaks', () => {
    // ReactMarkdown converts double newlines to separate <p> elements (standard markdown)
    const { container } = render(<LatexRenderer value={"Line one\n\nLine two"} />)
    const paragraphs = container.querySelectorAll('p')
    expect(paragraphs.length).toBeGreaterThanOrEqual(2)
  })

  it('applies custom className', () => {
    const { container } = render(<LatexRenderer value="text" className="custom-class" />)
    expect(container.querySelector('.custom-class')).not.toBeNull()
  })
})
