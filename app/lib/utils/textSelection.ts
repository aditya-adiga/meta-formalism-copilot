export function getSelectionCoordinates(
  element: HTMLTextAreaElement
): { top: number; left: number; bottom: number } | null {
  const start = element.selectionStart;
  const end = element.selectionEnd;
  
  if (start === end) return null;

  // Create a mirror div to measure text position
  const div = document.createElement('div');
  const computed = window.getComputedStyle(element);
  
  // Copy relevant styles
  const styles = [
    'font-family', 'font-size', 'font-weight', 'font-style',
    'letter-spacing', 'line-height', 'padding-left', 'padding-right',
    'padding-top', 'padding-bottom', 'width', 'white-space',
    'word-wrap', 'overflow-wrap'
  ];
  
  styles.forEach(prop => {
    const value = computed.getPropertyValue(prop);
    if (value) {
      div.style.setProperty(prop, value);
    }
  });
  
  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.height = 'auto';
  div.style.overflow = 'hidden';
  div.style.whiteSpace = 'pre-wrap';
  div.style.wordWrap = 'break-word';
  
  document.body.appendChild(div);
  
  // Get text before selection end
  const textBeforeEnd = element.value.substring(0, end);
  div.textContent = textBeforeEnd;
  
  // Measure the height to get vertical position
  const contentHeight = div.scrollHeight;
  
  // Clean up
  document.body.removeChild(div);
  
  const lineHeight = parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.9;
  const paddingTop = parseFloat(computed.paddingTop) || 0;
  
  return {
    top: contentHeight + paddingTop,
    left: 0, // Will center horizontally
    bottom: contentHeight + paddingTop + lineHeight,
  };
}
