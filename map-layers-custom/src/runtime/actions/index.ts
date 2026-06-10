import Goto from './goto'
import Label from './label'
import Transparency from './transparency'
import Information from './information'
import OptionAction from './option-action'
import Popup from './popup'
import VisibilityRange from './visibility-range'
import ChangeSymbol from './change-symbol'
import Solo from './solo'
import Flash from './flash'
import CopyUrl from './copy-url'
import Refresh from './refresh'
import LayerDetails from './layer-details'
import Spotlight from './spotlight'
import ClearSpotlight from './clear-spotlight'
import MoveToTop from './move-to-top'
import MoveToBottom from './move-to-bottom'
import MoveOutOfGroup from './move-out-of-group'
import Remove from './remove'

export function getLayerListActions (widget) {
  const translate = widget.translate

  const rawActions = [
    new Goto(
      widget,
      translate('goto')
    ),
    new Label(
      widget,
      translate('showLabels'),
      translate('hideLabels')
    ),
    new Popup(
      widget,
      translate('enablePopup'),
      translate('disablePopup')
    ),
    new Transparency(
      widget,
      translate('transparency')
    ),
    new VisibilityRange(
      widget,
      translate('visibilityRange')
    ),
    new Information(
      widget,
      translate('information')
    ),
    new ChangeSymbol(
      widget,
      translate('changeSymbol')
    ),
    new Solo(
      widget,
      translate('soloLayer')
    ),
    new Flash(
      widget,
      translate('flashLayer')
    ),
    new CopyUrl(
      widget,
      translate('copyUrl')
    ),
    new Refresh(
      widget,
      translate('refreshLayer')
    ),
    new LayerDetails(
      widget,
      translate('layerDetails')
    ),
    new Spotlight(
      widget,
      translate('spotlight')
    ),
    new ClearSpotlight(
      widget,
      translate('clearSpotlight')
    ),
    new MoveToTop(
      widget,
      translate('moveToTop')
    ),
    new MoveToBottom(
      widget,
      translate('moveToBottom')
    ),
    new MoveOutOfGroup(
      widget,
      translate('moveOutOfGroup')
    ),
    new Remove(
      widget,
      translate('remove')
    ),
    new OptionAction(
      widget,
      translate('options')
    )
  ]
  // Sort actions according to the group number
  return rawActions.sort((a, b) => {
    return a.group - b.group
  })
}
