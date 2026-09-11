/*
  exb-editor-shims.d.ts  (Visual Studio only, mode B)

  Experience Builder 1.21 installs the client with pnpm. Visual Studio cannot read
  through the pnpm junctions under client\node_modules (IDE1100 "Access to the path is
  denied"), so its TypeScript service has no types for React, jimu or the Maps SDK and
  reports hundreds of false errors. This file declares every module the widget imports
  ambiently, closely enough that real props and state type check, so the Error List
  reads zero for the widget's own files.

  Webpack ignores .d.ts files. Nothing here affects the build or the runtime bundle.
  Webpack (npm start in client) remains the only type authority.

  If a new import shows TS2307 in Visual Studio, add a `declare module` block below.
  If a new __esri.X shows TS2694, add an open interface to src/runtime/esri.d.ts.
*/

/* ------------------------------------------------------------------ React */

declare module 'react' {
    export type Key = string | number
    export type ReactText = string | number
    export type ReactChild = ReactElement | ReactText
    export type ReactFragment = Iterable<ReactNode>
    export type ReactNode = ReactElement | ReactText | ReactFragment | boolean | null | undefined
    export type ReactElement<P = any, T = any> = { type: T, props: P, key: Key | null }
    export type JSXElementConstructor<P> = ((props: P) => ReactElement<any, any> | null) | (new (props: P) => Component<any, any>)
    export type ElementType<P = any> = string | JSXElementConstructor<P>
    export type ComponentType<P = {}> = ComponentClass<P> | FunctionComponent<P>
    export type PropsWithChildren<P = {}> = P & { children?: ReactNode }
    export type PropsWithRef<P> = P
    export type PropsWithoutRef<P> = P
    export type ComponentProps<T> = any
    export type ComponentPropsWithoutRef<T> = any
    export type ComponentPropsWithRef<T> = any

    export interface RefObject<T> { readonly current: T | null }
    export interface MutableRefObject<T> { current: T }
    export type RefCallback<T> = (instance: T | null) => void
    export type Ref<T> = RefCallback<T> | RefObject<T> | null
    export type LegacyRef<T> = string | Ref<T>
    export type ForwardedRef<T> = ((instance: T | null) => void) | MutableRefObject<T | null> | null

    export interface FunctionComponent<P = {}> {
        (props: PropsWithChildren<P>, context?: any): ReactElement<any, any> | null
        displayName?: string
        defaultProps?: Partial<P>
    }
    export type FC<P = {}> = FunctionComponent<P>
    export interface ForwardRefRenderFunction<T, P = {}> { (props: P, ref: ForwardedRef<T>): ReactElement | null, displayName?: string }
    export interface ForwardRefExoticComponent<P> extends FunctionComponent<P> { }
    export type ComponentClass<P = {}, S = any> = new (props: P, context?: any) => Component<P, S>

    export interface ErrorInfo { componentStack?: string | null }
    export interface Attributes { key?: Key | null }
    export interface ClassAttributes<T> extends Attributes { ref?: LegacyRef<T> }

    export class Component<P = {}, S = {}, SS = any> {
        constructor(props: Readonly<P> | P, context?: any)
        readonly props: Readonly<P> & Readonly<{ children?: ReactNode }>
        state: Readonly<S>
        context: any
        refs: { [key: string]: any }
        setState<K extends keyof S>(
            state: ((prevState: Readonly<S>, props: Readonly<P>) => (Pick<S, K> | S | null)) | (Pick<S, K> | S | null),
            callback?: () => void
        ): void
        forceUpdate(callback?: () => void): void
        render(): ReactNode
        componentDidMount?(): void | Promise<void>
        shouldComponentUpdate?(nextProps: Readonly<P>, nextState: Readonly<S>, nextContext: any): boolean
        componentWillUnmount?(): void
        componentDidCatch?(error: Error, errorInfo: ErrorInfo): void
        getSnapshotBeforeUpdate?(prevProps: Readonly<P>, prevState: Readonly<S>): SS | null
        componentDidUpdate?(prevProps: Readonly<P>, prevState: Readonly<S>, snapshot?: SS): void
        static contextType?: any
        static defaultProps?: any
        static displayName?: string
    }
    export class PureComponent<P = {}, S = {}, SS = any> extends Component<P, S, SS> { }

    export const Fragment: any
    export const StrictMode: any
    export const Suspense: any
    export const Profiler: any
    export function createElement(type: any, props?: any, ...children: any[]): ReactElement
    export function cloneElement(element: any, props?: any, ...children: any[]): ReactElement
    export function isValidElement(object: any): boolean
    export function createRef<T>(): RefObject<T>
    export function forwardRef<T, P = {}>(render: ForwardRefRenderFunction<T, P>): ForwardRefExoticComponent<PropsWithoutRef<P> & { ref?: Ref<T> }>
    export function memo<T>(component: T, propsAreEqual?: (prev: any, next: any) => boolean): T
    export function lazy<T>(factory: () => Promise<{ default: T }>): T
    export function createContext<T>(defaultValue: T): Context<T>
    export interface Context<T> { Provider: any, Consumer: any, displayName?: string }
    export const Children: { map: (children: any, fn: (child: any, index: number) => any) => any[], forEach: (children: any, fn: (child: any, index: number) => void) => void, count: (children: any) => number, only: (children: any) => any, toArray: (children: any) => any[] }
    export const version: string

    export type SetStateAction<S> = S | ((prevState: S) => S)
    export type Dispatch<A> = (value: A) => void
    export type DependencyList = ReadonlyArray<any>
    export type EffectCallback = () => (void | (() => void))
    export type Reducer<S, A> = (prevState: S, action: A) => S
    export function useState<S>(initialState: S | (() => S)): [S, Dispatch<SetStateAction<S>>]
    export function useState<S = undefined>(): [S | undefined, Dispatch<SetStateAction<S | undefined>>]
    export function useEffect(effect: EffectCallback, deps?: DependencyList): void
    export function useLayoutEffect(effect: EffectCallback, deps?: DependencyList): void
    export function useContext<T>(context: Context<T>): T
    export function useReducer<S, A>(reducer: Reducer<S, A>, initialState: S, init?: (s: S) => S): [S, Dispatch<A>]
    export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: DependencyList): T
    export function useMemo<T>(factory: () => T, deps: DependencyList | undefined): T
    export function useRef<T>(initialValue: T): MutableRefObject<T>
    export function useRef<T>(initialValue: T | null): RefObject<T>
    export function useRef<T = undefined>(): MutableRefObject<T | undefined>
    export function useImperativeHandle<T, R extends T>(ref: Ref<T> | undefined, init: () => R, deps?: DependencyList): void
    export function useDebugValue<T>(value: T, format?: (value: T) => any): void
    export function useId(): string
    export function useTransition(): [boolean, (callback: () => void) => void]
    export function useDeferredValue<T>(value: T): T
    export function useSyncExternalStore<T>(subscribe: (cb: () => void) => () => void, getSnapshot: () => T, getServerSnapshot?: () => T): T

    /* Events. Target typing is what the widget relies on (e.target.value, e.currentTarget). */
    export interface SyntheticEvent<T = Element, E = Event> {
        nativeEvent: E
        currentTarget: EventTarget & T
        target: EventTarget & T
        bubbles: boolean
        cancelable: boolean
        defaultPrevented: boolean
        eventPhase: number
        isTrusted: boolean
        timeStamp: number
        type: string
        preventDefault(): void
        isDefaultPrevented(): boolean
        stopPropagation(): void
        isPropagationStopped(): boolean
        persist(): void
    }
    export interface UIEvent<T = Element, E = NativeUIEvent> extends SyntheticEvent<T, E> { detail: number, view: any }
    export interface ChangeEvent<T = Element> extends SyntheticEvent<T> { target: EventTarget & T }
    export interface FormEvent<T = Element> extends SyntheticEvent<T> { }
    export interface FocusEvent<T = Element, R = Element> extends SyntheticEvent<T, NativeFocusEvent> { relatedTarget: (EventTarget & R) | null }
    export interface MouseEvent<T = Element, E = NativeMouseEvent> extends UIEvent<T, E> {
        altKey: boolean, button: number, buttons: number, clientX: number, clientY: number, ctrlKey: boolean, metaKey: boolean
        movementX: number, movementY: number, pageX: number, pageY: number, relatedTarget: EventTarget | null
        screenX: number, screenY: number, shiftKey: boolean
        getModifierState(key: string): boolean
    }
    export interface PointerEvent<T = Element> extends MouseEvent<T, NativePointerEvent> { pointerId: number, pressure: number, width: number, height: number, pointerType: 'mouse' | 'pen' | 'touch', isPrimary: boolean }
    export interface WheelEvent<T = Element> extends MouseEvent<T, NativeWheelEvent> { deltaMode: number, deltaX: number, deltaY: number, deltaZ: number }
    export interface TouchEvent<T = Element> extends UIEvent<T, NativeTouchEvent> { altKey: boolean, ctrlKey: boolean, metaKey: boolean, shiftKey: boolean, changedTouches: any, targetTouches: any, touches: any }
    export interface KeyboardEvent<T = Element> extends UIEvent<T, NativeKeyboardEvent> {
        altKey: boolean, ctrlKey: boolean, code: string, key: string, locale: string, location: number, metaKey: boolean, repeat: boolean, shiftKey: boolean
        getModifierState(key: string): boolean
    }
    export interface DragEvent<T = Element> extends MouseEvent<T, NativeDragEvent> { dataTransfer: DataTransfer }
    export interface ClipboardEvent<T = Element> extends SyntheticEvent<T, NativeClipboardEvent> { clipboardData: DataTransfer }
    export interface AnimationEvent<T = Element> extends SyntheticEvent<T, NativeAnimationEvent> { animationName: string, elapsedTime: number, pseudoElement: string }
    export interface TransitionEvent<T = Element> extends SyntheticEvent<T, NativeTransitionEvent> { elapsedTime: number, propertyName: string, pseudoElement: string }

    type NativeUIEvent = globalThis.UIEvent
    type NativeFocusEvent = globalThis.FocusEvent
    type NativeMouseEvent = globalThis.MouseEvent
    type NativePointerEvent = globalThis.PointerEvent
    type NativeWheelEvent = globalThis.WheelEvent
    type NativeTouchEvent = globalThis.TouchEvent
    type NativeKeyboardEvent = globalThis.KeyboardEvent
    type NativeDragEvent = globalThis.DragEvent
    type NativeClipboardEvent = globalThis.ClipboardEvent
    type NativeAnimationEvent = globalThis.AnimationEvent
    type NativeTransitionEvent = globalThis.TransitionEvent

    export type EventHandler<E extends SyntheticEvent<any>> = (event: E) => void
    export type ReactEventHandler<T = Element> = EventHandler<SyntheticEvent<T>>
    export type ChangeEventHandler<T = Element> = EventHandler<ChangeEvent<T>>
    export type MouseEventHandler<T = Element> = EventHandler<MouseEvent<T>>
    export type KeyboardEventHandler<T = Element> = EventHandler<KeyboardEvent<T>>
    export type FocusEventHandler<T = Element> = EventHandler<FocusEvent<T>>
    export type FormEventHandler<T = Element> = EventHandler<FormEvent<T>>

    /* Styles. Open so any CSS property (including custom properties) is accepted. */
    export interface CSSProperties { [property: string]: string | number | undefined | null }

    /* DOM attribute bags. Kept open on purpose; strictness here buys nothing in an editor shim. */
    export interface DOMAttributes<T> { children?: ReactNode, [attr: string]: any }
    export interface HTMLAttributes<T> extends DOMAttributes<T> { className?: string, id?: string, style?: CSSProperties, title?: string, role?: string, tabIndex?: number, hidden?: boolean }
    export interface ButtonHTMLAttributes<T> extends HTMLAttributes<T> { disabled?: boolean, type?: 'button' | 'submit' | 'reset', value?: any }
    export interface InputHTMLAttributes<T> extends HTMLAttributes<T> { disabled?: boolean, type?: string, value?: any, checked?: boolean, placeholder?: string, name?: string }
    export interface SelectHTMLAttributes<T> extends HTMLAttributes<T> { disabled?: boolean, value?: any, name?: string, multiple?: boolean }
    export interface TextareaHTMLAttributes<T> extends HTMLAttributes<T> { disabled?: boolean, value?: any, rows?: number, cols?: number, placeholder?: string }
    export interface SVGAttributes<T> extends DOMAttributes<T> { [attr: string]: any }
    export type DetailedHTMLProps<E extends HTMLAttributes<T>, T> = ClassAttributes<T> & E
    export type HTMLProps<T> = HTMLAttributes<T> & ClassAttributes<T>

    export namespace JSX {
        type Element = ReactElement<any, any>
        interface ElementClass extends Component<any> { render(): ReactNode }
        interface ElementAttributesProperty { props: {} }
        interface ElementChildrenAttribute { children: {} }
        type LibraryManagedAttributes<C, P> = P
        interface IntrinsicAttributes extends Attributes { }
        interface IntrinsicClassAttributes<T> extends ClassAttributes<T> { }
        interface IntrinsicElements { [elemName: string]: any }
    }
}

declare module 'react/jsx-runtime' {
    export const Fragment: any
    export function jsx(type: any, props: any, key?: any): any
    export function jsxs(type: any, props: any, key?: any): any
    export namespace JSX {
        type Element = import('react').ReactElement<any, any>
        interface ElementClass extends import('react').Component<any> { render(): import('react').ReactNode }
        interface ElementAttributesProperty { props: {} }
        interface ElementChildrenAttribute { children: {} }
        type LibraryManagedAttributes<C, P> = P
        interface IntrinsicAttributes extends import('react').Attributes { }
        interface IntrinsicClassAttributes<T> extends import('react').ClassAttributes<T> { }
        interface IntrinsicElements { [elemName: string]: any }
    }
}

declare module 'react/jsx-dev-runtime' {
    export * from 'react/jsx-runtime'
}

/* Emotion's JSX runtime is what EB's jsx pragma compiles through. Same shape as React's. */
declare module '@emotion/react/jsx-runtime' {
    export * from 'react/jsx-runtime'
}

declare module 'react-dom' {
    const ReactDOM: any
    export = ReactDOM
}

/* ---------------------------------------------------------------- jimu-core */

declare module 'jimu-core' {
    import * as ReactNS from 'react'
    export { ReactNS as React }
    export const ReactDOM: any
    export const ReactRedux: any
    export const ReactDOMClient: any
    export const classNames: any
    export const lodash: any
    export const moment: any
    export const i18n: any
    export const polished: any
    export const queryString: any
    export const uuidv1: any
    export const utils: any

    /** Emotion jsx pragma factory used by the @jsx pragma at the top of each tsx file. */
    export const jsx: any
    /** Emotion tagged template. */
    export const css: any
    export const Global: any
    export const keyframes: any
    export const ThemeProvider: any

    export interface ImmutableObject<T> {
        set: <K extends keyof T>(key: K | string, value: any) => ImmutableObject<T>
        setIn: (keyPath: Array<string | number>, value: any) => ImmutableObject<T>
        getIn: (keyPath: Array<string | number>, defaultValue?: any) => any
        merge: (other: any, options?: any) => ImmutableObject<T>
        update: (key: any, fn: (value: any) => any) => ImmutableObject<T>
        updateIn: (keyPath: Array<string | number>, fn: (value: any) => any) => ImmutableObject<T>
        without: (...keys: any[]) => ImmutableObject<T>
        asMutable: (options?: { deep?: boolean }) => T
        [key: string]: any
    }
    export type ImmutableArray<T> = ReadonlyArray<T> & {
        set: (index: number, value: T) => ImmutableArray<T>
        setIn: (keyPath: Array<string | number>, value: any) => ImmutableArray<T>
        getIn: (keyPath: Array<string | number>, defaultValue?: any) => any
        asMutable: (options?: { deep?: boolean }) => T[]
        [key: string]: any
    }
    export interface ImmutableStatic {
        <T>(obj: T, options?: any): T extends any[] ? ImmutableArray<T[number]> : ImmutableObject<T>
        isImmutable: (obj: any) => boolean
        asMutable: (obj: any, options?: any) => any
        from: (obj: any) => any
    }
    export const Immutable: ImmutableStatic

    export enum WidgetState { Opened = 'OPENED', Active = 'ACTIVE', Closed = 'CLOSED' }
    export enum DataSourceStatus { NotReady = 'NOT_READY', Unloaded = 'UNLOADED', Loading = 'LOADING', Loaded = 'LOADED', LoadError = 'LOAD_ERROR' }
    export enum LayoutType { FixedLayout = 'FIXED', FlowLayout = 'FLOW', GridLayout = 'GRID' }

    export interface IntlShape {
        formatMessage: (descriptor: { id: string, defaultMessage?: string }, values?: Record<string, any>) => string
        formatNumber: (value: number, options?: any) => string
        formatDate: (value: any, options?: any) => string
        locale: string
        [key: string]: any
    }
    export interface UseDataSource { dataSourceId: string, mainDataSourceId: string, dataViewId?: string, rootDataSourceId?: string, fields?: string[], [key: string]: any }
    export type IMUseDataSource = ImmutableObject<UseDataSource>
    export interface ThemeVariables { [key: string]: any }
    export type IMThemeVariables = ImmutableObject<ThemeVariables>
    export interface SizeModeLayoutJson { [key: string]: any }

    export interface AllWidgetProps<T = any> {
        id: string
        widgetId: string
        label: string
        intl: IntlShape
        config: T
        theme: IMThemeVariables
        state: WidgetState
        useDataSources?: ImmutableArray<UseDataSource>
        useMapWidgetIds?: ImmutableArray<string> | string[]
        outputDataSources?: ImmutableArray<string>
        useDataSourcesEnabled?: boolean
        portalUrl?: string
        portalSelf?: any
        user?: any
        locale?: string
        dispatch?: (action: any) => void
        stateProps?: any
        mutableStateProps?: any
        mutableStateVersion?: number
        isInlineEditing?: boolean
        layoutId?: string
        layoutItemId?: string
        builderSupportModules?: any
        autoWidth?: boolean
        autoHeight?: boolean
        enableDataAction?: boolean
        onInitResizeHandler?: any
        onInitDragHandler?: any
        manifest?: any
        version?: string
        [key: string]: any
    }
    export type AllWidgetSettingProps<T = any> = import('jimu-for-builder').AllWidgetSettingProps<T>

    export abstract class BaseWidget<P = any, S = any> extends ReactNS.PureComponent<P, S> { }
    export const appActions: any
    export const getAppStore: () => any
    export const getAppConfigAction: () => any
    export const AppMode: any
    export const dataSourceUtils: any
    export const DataSourceManager: any
    export const DataSourceComponent: any
    export const DataRecordsSelectionChangeMessage: any
    export const MessageManager: any
    export const MessageType: any
    export const SessionManager: any
    export const portalUrlUtils: any
    export const esri: any
    export const urlUtils: any
    export const requestUtils: any
    export const loadArcGISJSAPIModules: (modules: string[]) => Promise<any[]>
    export const useIntl: () => IntlShape
    export const hooks: any
    export const defaultMessages: any
    export const WidgetManager: any
    export const WidgetVersionManager: any
    export const BaseVersionManager: any
    export const ReactResizeDetector: any
    export const focusElementInKeyboardMode: (el: any) => void
    export function getTheme(): any
    export const themeUtils: any
    export const injectIntl: any
    export const FormattedMessage: any
    export type IMState = any
    export type IMConfig = any
    export type IMDataSourceInfo = any
    export type DataRecord = any
    export type DataSource = any
    export type QueriableDataSource = any
    export type FeatureLayerDataSource = any
    export type DataSourceJson = any
    export type IMDataSourceJson = any
    export type IMAppConfig = any
    export type IMWidgetJson = any
    export type WidgetJson = any
    export type BrowserSizeMode = any
    export type LayoutInfo = any
    export type IMLayoutJson = any
    export type IMUrlParameters = any
    export type MessageAction = any
    export type Message = any
    export type Size = { width: number | string, height: number | string }
    export type Padding = any
    export type BoundingBox = any
    export type Expression = any
    export type Extent = any
}

declare module 'jimu-core/lib/types/props' {
    export * from 'jimu-core'
}

/* --------------------------------------------------------------- jimu-arcgis */

declare module 'jimu-arcgis' {
    import * as ReactNS from 'react'
    export interface JimuMapView {
        id: string
        view: any
        mapWidgetId: string
        dataSourceId?: string
        jimuLayerViews?: { [id: string]: any }
        whenJimuMapViewLoaded: () => Promise<any>
        whenAllJimuLayerViewLoaded: () => Promise<any>
        getJimuLayerViewByAPILayer: (layer: any) => any
        createJimuLayerView: (layer: any, ...rest: any[]) => Promise<any>
        addLayer: (layer: any, ...rest: any[]) => any
        removeLayer: (layer: any) => void
        clearSelectedFeatures: () => void
        isActive: boolean
        [key: string]: any
    }
    export interface JimuMapViewComponentProps {
        useMapWidgetId?: string
        onActiveViewChange?: (view: JimuMapView) => void
        onViewsCreate?: (views: { [id: string]: JimuMapView }) => void
        onViewGroupCreate?: (group: any) => void
    }
    export class JimuMapViewComponent extends ReactNS.PureComponent<JimuMapViewComponentProps, any> { }
    export function loadArcGISJSAPIModules(modules: string[]): Promise<any[]>
    export function loadArcGISJSAPIModule(module: string): Promise<any>
    export const MapViewManager: any
    export const JimuMapViewGroup: any
    export const JimuLayerView: any
    export const JimuFeatureLayerView: any
    export const JimuLayerViewSelector: any
    export const geometryUtils: any
    export const ArcGISDataSourceTypes: any
    export const loadArcGISJSAPIModulesWithProgress: any
}

/* ------------------------------------------------------------------- jimu-ui */

declare module 'jimu-ui' {
    import * as ReactNS from 'react'
    /** Every jimu-ui component accepts arbitrary props in this shim. */
    type AnyComponent = ReactNS.ComponentType<any> & { [key: string]: any }
    export const Button: AnyComponent
    export const ButtonGroup: AnyComponent
    export const TextInput: AnyComponent
    export const TextArea: AnyComponent
    export const NumericInput: AnyComponent
    export const Select: AnyComponent
    export const Option: AnyComponent
    export const MultiSelect: AnyComponent
    export const Switch: AnyComponent
    export const Checkbox: AnyComponent
    export const Radio: AnyComponent
    export const Label: AnyComponent
    export const Icon: AnyComponent
    export const Alert: AnyComponent
    export const Tooltip: AnyComponent
    export const Popper: AnyComponent
    export const Tabs: AnyComponent
    export const Tab: AnyComponent
    export const Loading: AnyComponent
    export const Modal: AnyComponent
    export const ModalHeader: AnyComponent
    export const ModalBody: AnyComponent
    export const ModalFooter: AnyComponent
    export const Dropdown: AnyComponent
    export const DropdownButton: AnyComponent
    export const DropdownMenu: AnyComponent
    export const DropdownItem: AnyComponent
    export const CollapsablePanel: AnyComponent
    export const Card: AnyComponent
    export const CardBody: AnyComponent
    export const CardHeader: AnyComponent
    export const CardFooter: AnyComponent
    export const Badge: AnyComponent
    export const Slider: AnyComponent
    export const Progress: AnyComponent
    export const Nav: AnyComponent
    export const NavItem: AnyComponent
    export const NavLink: AnyComponent
    export const Navbar: AnyComponent
    export const Collapse: AnyComponent
    export const Paper: AnyComponent
    export const Table: AnyComponent
    export const Pagination: AnyComponent
    export const Link: AnyComponent
    export const Image: AnyComponent
    export const ColorPicker: AnyComponent
    export const Dnd: AnyComponent
    export const FloatingPanel: AnyComponent
    export const AdvancedSelect: AnyComponent
    export const UrlInput: AnyComponent
    export const defaultMessages: any
    export const hooks: any
    export const utils: any
    export const styleUtils: any
    export const DistanceUnits: any
    export const LinearUnit: any
    export const FontFamilyValue: any
    export type IconProps = any
    export type ButtonProps = any
    export type TextInputProps = any
    export type SelectProps = any
    export type SwitchProps = any
    export type CheckboxProps = any
    export type AlertProps = any
    export type ModalProps = any
    export type TabsProps = any
    export type ButtonType = 'default' | 'primary' | 'secondary' | 'tertiary' | 'danger' | 'link'
    export type ButtonSize = 'default' | 'sm' | 'lg'
}

declare module 'jimu-ui/advanced/setting-components' {
    import * as ReactNS from 'react'
    type AnyComponent = ReactNS.ComponentType<any> & { [key: string]: any }
    export const SettingSection: AnyComponent
    export const SettingRow: AnyComponent
    export const MapWidgetSelector: AnyComponent
    export const DataSourceSelector: AnyComponent
    export const FieldSelector: AnyComponent
    export const JimuLayerViewSelector: AnyComponent
    export const SidePopper: AnyComponent
    export const ThemeColorPicker: AnyComponent
    export const ColorPicker: AnyComponent
    export const IconPicker: AnyComponent
    export const SqlExpressionBuilder: AnyComponent
    export const ExpressionBuilder: AnyComponent
    export const List: AnyComponent
    export const TreeItemActionType: any
    export const AllDataSourceTypes: any
    export const defaultMessages: any
}

declare module 'jimu-ui/advanced/*' {
    const anything: any
    export = anything
}

declare module 'jimu-ui/basic/*' {
    const anything: any
    export = anything
}

/* Real path is jimu-ui/calcite-components; EB also exposes it under this bare name. */
declare module 'calcite-components' {
    import * as ReactNS from 'react'
    type AnyComponent = ReactNS.ComponentType<any> & { [key: string]: any }
    export const CalciteIcon: AnyComponent
    export const CalciteChip: AnyComponent
    export const CalciteButton: AnyComponent
    export const CalciteAction: AnyComponent
    export const CalciteLoader: AnyComponent
    export const CalciteNotice: AnyComponent
    export const CalciteTooltip: AnyComponent
    export const CalciteSwitch: AnyComponent
    export const CalciteSelect: AnyComponent
    export const CalciteOption: AnyComponent
    export const CalciteSegmentedControl: AnyComponent
    export const CalciteSegmentedControlItem: AnyComponent
}

declare module 'jimu-ui/calcite-components' {
    export * from 'calcite-components'
}

/* ---------------------------------------------------------------- jimu-theme */

declare module 'jimu-theme' {
    export function useTheme(): any
    export function useTheme2(): any
    export function useUseTheme2(): any
    export const ThemeSwitchComponent: any
    export const styled: any
    export const css: any
    export const getTheme: () => any
    export const getTheme2: () => any
    export type IMThemeVariables = any
    export type ThemeVariables = any
}

/* ---------------------------------------------------------- jimu-for-builder */

declare module 'jimu-for-builder' {
    import { ImmutableArray, IntlShape } from 'jimu-core'
    export interface AllWidgetSettingProps<T = any> {
        id: string
        widgetId: string
        label: string
        intl: IntlShape
        config: T
        theme: any
        onSettingChange: (settings: { id: string, config?: any, useDataSources?: any, useMapWidgetIds?: any, useDataSourcesEnabled?: boolean, [key: string]: any }, ...rest: any[]) => void
        useDataSources?: ImmutableArray<any>
        useMapWidgetIds?: ImmutableArray<string> | string[]
        useDataSourcesEnabled?: boolean
        portalUrl?: string
        portalSelf?: any
        user?: any
        locale?: string
        manifest?: any
        dispatch?: (action: any) => void
        [key: string]: any
    }
    export const getAppConfigAction: () => any
    export const builderAppSync: any
    export const helpUtils: any
    export const utils: any
    export type IMConfig = any
}

declare module 'jimu-icons/*' {
    const Icon: any
    export default Icon
    export = Icon
}

declare module 'jimu-icons/svg/*' {
    const Icon: any
    export default Icon
}

/* ------------------------------------------------------------------ Maps SDK */

/** Every Maps SDK module the widget loads through loadArcGISJSAPIModules or imports statically. */
declare module 'esri/*' {
    const anything: any
    export default anything
}

declare module '@arcgis/core/*' {
    const anything: any
    export default anything
}

declare module '@esri/*' {
    const anything: any
    export = anything
}

/* --------------------------------------------------- widget's own dependencies */

declare module '@turf/turf' {
    const turf: any
    export = turf
}

declare module 'jspdf' {
    export class jsPDF {
        constructor(options?: any)
        [member: string]: any
    }
    export default jsPDF
    export type jsPDFOptions = any
}

declare module 'seamless-immutable' {
    const Immutable: any
    export = Immutable
}

/* ------------------------------------------------------------------- assets */

declare module '*.css'
declare module '*.scss'
declare module '*.svg' {
    const src: string
    export default src
}
declare module '*.png' {
    const src: string
    export default src
}
declare module '*.json' {
    const value: any
    export default value
}

/* ------------------------------------------------------------- global JSX */
/*
  Classic JSX (tsconfig "jsx": "react") types elements against the GLOBAL JSX
  namespace, not react/jsx-runtime. Declaring it here means Visual Studio never
  resolves @emotion/react/jsx-runtime or @types/react, so the EB 1.21 pnpm
  IDE1100 "Access to the path ... client\node_modules ... is denied" cannot
  occur. Everything is `any`; this is an editor shim, not a type authority.
  Webpack is unaffected (it reads the @jsx jsx pragma at the top of each file).
  Kept as a top-level `declare namespace` with no import/export so this file
  stays a script and its `declare module` blocks remain ambient (global).
*/
declare namespace JSX {
    type Element = any
    interface ElementClass { render(): any }
    interface ElementAttributesProperty { props: {} }
    interface ElementChildrenAttribute { children: {} }
    interface IntrinsicAttributes { [key: string]: any }
    interface IntrinsicClassAttributes<T> { [key: string]: any }
    interface IntrinsicElements { [elemName: string]: any }
}