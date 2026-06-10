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
