// Ambient module declarations so editors (e.g. Visual Studio) stop flagging
// asset imports like `import icon from '../../icon.svg'`. These have no runtime
// effect — Experience Builder's bundler already handles these imports — they
// only satisfy the TypeScript language service.
declare module '*.svg' {
  const content: string
  export default content
}
declare module '*.png' {
  const content: string
  export default content
}
declare module '*.gif' {
  const content: string
  export default content
}
declare module '*.jpg' {
  const content: string
  export default content
}

// Type-only compatibility shims for Visual Studio with the pnpm layout used by
// Experience Builder 1.21. The runtime build still resolves the real modules.
declare module '@emotion/react/jsx-runtime' {
  export * from 'react/jsx-runtime'
}

declare module 'esri/core/reactiveUtils' {
  export function watch(
    getValue: () => any,
    callback: (value: any, oldValue?: any) => void,
    options?: any
  ): any
}


// shpjs is bundled as a runtime dependency. This declaration is type-only and
// allows the EB 1.21 Visual Studio language service to resolve dynamic imports.
declare module 'shpjs' {
  const parseShapefile: (input: ArrayBuffer | Uint8Array | string) => Promise<any>
  export default parseShapefile
}
