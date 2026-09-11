import { React } from 'jimu-core'
import { Button } from 'jimu-ui'
import { CalciteIcon } from 'calcite-components'
import { useTokens } from '../theme'

/**
 * The first-run banner from the shared help pattern. The parent widget is a class component
 * and cannot call useTokens() itself, so it renders this small function component instead
 * (the same approach Print Advanced uses). Markup matches the playbook verbatim.
 */
export interface FirstRunHintProps {
  title: string
  body: string
  linkLabel: string
  dismissLabel: string
  onOpenHelp: () => void
  onDismiss: () => void
}

const FirstRunHint: React.FC<FirstRunHintProps> = ({ title, body, linkLabel, dismissLabel, onOpenHelp, onDismiss }) => {
  const tokens = useTokens()
  return (
    <div role="note" style={{ margin: '0 14px 10px 14px', padding: '10px 12px', display: 'flex', alignItems: 'flex-start', gap: '10px', background: tokens.infoBg, color: tokens.text, border: `1px solid ${tokens.divider}`, borderLeft: `3px solid ${tokens.primary}`, borderRadius: tokens.radius, fontSize: '12px', lineHeight: 1.5 }}>
      <span style={{ color: tokens.primary, marginTop: '1px' }} aria-hidden="true"><CalciteIcon icon="lightbulb" scale="s" /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ display: 'block', marginBottom: '2px' }}>{title}</strong>
        {body}
        {' '}
        <button type="button" onClick={onOpenHelp} style={{ border: 'none', background: 'transparent', padding: 0, color: tokens.primary, cursor: 'pointer', textDecoration: 'underline', font: 'inherit' }}>{linkLabel}</button>
      </span>
      <Button size="sm" type="tertiary" icon onClick={onDismiss} title={dismissLabel} aria-label={dismissLabel}>
        <CalciteIcon icon="x" scale="s" />
      </Button>
    </div>
  )
}

export default FirstRunHint
