import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FileUpload from './FileUpload'

function createFile(name: string): File {
  return new File(['content'], name, { type: 'text/plain' })
}

describe('FileUpload', () => {
  it('renders the upload button with accepted file types', () => {
    render(<FileUpload />)
    expect(screen.getByText('.txt, .doc, .docx, .pdf')).toBeInTheDocument()
  })

  it('does not show a file list when no files are uploaded', () => {
    render(<FileUpload />)
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('shows uploaded files in a list', async () => {
    render(<FileUpload />)
    const input = screen.getByLabelText('Choose files') as HTMLInputElement

    await userEvent.upload(input, createFile('notes.txt'))

    expect(screen.getByText('notes.txt')).toBeInTheDocument()
  })

  it('accumulates multiple uploads', async () => {
    render(<FileUpload />)
    const input = screen.getByLabelText('Choose files') as HTMLInputElement

    await userEvent.upload(input, createFile('a.txt'))
    await userEvent.upload(input, createFile('b.txt'))

    expect(screen.getByText('a.txt')).toBeInTheDocument()
    expect(screen.getByText('b.txt')).toBeInTheDocument()
  })

  it('removes a file when its remove button is clicked', async () => {
    render(<FileUpload />)
    const input = screen.getByLabelText('Choose files') as HTMLInputElement

    await userEvent.upload(input, createFile('remove-me.txt'))
    expect(screen.getByText('remove-me.txt')).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Remove remove-me.txt'))
    expect(screen.queryByText('remove-me.txt')).not.toBeInTheDocument()
  })
})
