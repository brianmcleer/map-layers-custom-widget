import { React } from 'jimu-core'
import { Button, Modal, ModalBody, ModalFooter, ModalHeader, TextInput } from 'jimu-ui'
import { CalciteIcon } from 'calcite-components'
import { useTokens } from '../theme'

const { useState, useEffect } = React

export interface HelpSection {
  /** Stable key: search behavior and the opening section depend on it. Use the standard
   *  keys from 10.6 so search behaves the same way across widgets. */
  key: string
  /** Calcite icon name, e.g. 'play', 'save', 'map', 'ellipsis', 'share', 'search',
   *  'folder', 'exclamation-mark-triangle', 'lightbulb'. */
  icon: string
  title: string
  /** Optional sentence above the list, in the section's own words. */
  intro?: string
  body: string[]
  /** Numbered steps instead of bullets. Start here only. */
  ordered?: boolean
}

export interface HelpPopupProps {
  open: boolean
  onClose: () => void
  /** Built per widget in helpSections.ts from translations plus feature flags. */
  sections: HelpSection[]
  /** Key of the section open when the guide first shows. */
  initialKey?: string
  title: string
  intro: string
  searchPlaceholder: string
  noMatches: string
  closeLabel: string
}

const HelpPopup: React.FC<HelpPopupProps> = ({
  open, onClose, sections, initialKey = 'start',
  title, intro, searchPlaceholder, noMatches, closeLabel
}) => {
  const tokens = useTokens()
  // One section open at a time, so the guide never grows past the screen.
  const [openKey, setOpenKey] = useState<string>(initialKey)
  const [query, setQuery] = useState('')

  // Search: keep only lines that mention the word; a section whose title matches keeps all lines.
  const needle = query.trim().toLowerCase()
  const visible: HelpSection[] = needle
    ? sections
      .map((s: HelpSection): HelpSection => {
        if (s.title.toLowerCase().includes(needle)) return s
        const secIntro = s.intro && s.intro.toLowerCase().includes(needle) ? s.intro : undefined
        return { ...s, intro: secIntro, body: s.body.filter((line: string) => line.toLowerCase().includes(needle)) }
      })
      .filter((s: HelpSection) => s.body.length > 0 || !!s.intro)
    : sections

  // While searching, the first matching section opens so the hit is visible without a click.
  useEffect(() => {
    if (needle && visible.length > 0 && !visible.some((s: HelpSection) => s.key === openKey)) setOpenKey(visible[0].key)
  }, [needle]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reopening the guide starts fresh, so a word typed last time is not still filtering.
  useEffect(() => {
    if (open) { setQuery(''); setOpenKey(initialKey) }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  const toggle = (key: string): void => { setOpenKey(openKey === key ? '' : key) }

  const highlight = (line: string): React.ReactNode => {
    if (!needle) return line
    const at = line.toLowerCase().indexOf(needle)
    if (at < 0) return line
    return (
      <React.Fragment>
        {line.slice(0, at)}
        <mark style={{ background: tokens.infoBg, color: tokens.text, padding: '0 1px', borderRadius: '2px' }}>{line.slice(at, at + needle.length)}</mark>
        {line.slice(at + needle.length)}
      </React.Fragment>
    )
  }

  return (
    <Modal isOpen centered toggle={onClose} size="sm">
      <ModalHeader toggle={onClose}>{title}</ModalHeader>
      {/* Scrolls as a safety net on very short screens; the accordion keeps it short normally. */}
      <ModalBody style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: tokens.text, lineHeight: 1.55 }}>{intro}</p>

        <div style={{ marginBottom: '10px' }}>
          <TextInput
            type="text"
            size="sm"
            allowClear
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setQuery(e.target.value) }}
          />
        </div>

        {visible.length === 0 && (
          <p style={{ margin: 0, fontSize: '13px', color: tokens.textSecondary }}>{noMatches}</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {visible.map((s: HelpSection) => {
            const isOpen = openKey === s.key
            const ListTag: any = s.ordered ? 'ol' : 'ul'
            return (
              <div key={s.key} style={{ border: `1px solid ${isOpen ? tokens.primary : tokens.divider}`, borderRadius: tokens.radius, overflow: 'hidden' }}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => { toggle(s.key) }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', textAlign: 'left', padding: '9px 10px', border: 'none', background: isOpen ? tokens.infoBg : tokens.surface, color: tokens.text, cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                >
                  <span style={{ color: tokens.primary, display: 'flex' }} aria-hidden="true"><CalciteIcon icon={s.icon} scale="s" /></span>
                  <span style={{ flex: 1 }}>{highlight(s.title)}</span>
                  <CalciteIcon icon={isOpen ? 'chevron-up' : 'chevron-down'} scale="s" />
                </button>
                {isOpen && (
                  <div style={{ padding: '8px 12px 10px 12px', fontSize: '13px', lineHeight: 1.6, color: tokens.text }}>
                    {s.intro && <p style={{ margin: '0 0 6px 0', color: tokens.textSecondary }}>{highlight(s.intro)}</p>}
                    {s.body.length > 0 && (
                      <ListTag style={{ margin: 0, paddingLeft: '20px' }}>
                        {s.body.map((line: string, i: number) => <li key={i} style={{ marginBottom: '6px' }}>{highlight(line)}</li>)}
                      </ListTag>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button type="primary" onClick={onClose}>{closeLabel}</Button>
      </ModalFooter>
    </Modal>
  )
}

export default HelpPopup
