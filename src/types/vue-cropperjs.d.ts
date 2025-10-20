declare module 'vue-cropperjs' {
  import { DefineComponent } from 'vue'

  interface CropperOptions {
    aspectRatio?: number
    viewMode?: number
    dragMode?: string
    autoCropArea?: number
    background?: boolean
    responsive?: boolean
    restore?: boolean
    checkCrossOrigin?: boolean
    checkOrientation?: boolean
    modal?: boolean
    guides?: boolean
    center?: boolean
    highlight?: boolean
    cropBoxMovable?: boolean
    cropBoxResizable?: boolean
    toggleDragModeOnDblclick?: boolean
    size?: number
    minContainerWidth?: number
    minContainerHeight?: number
    minCanvasWidth?: number
    minCanvasHeight?: number
    minCropBoxWidth?: number
    minCropBoxHeight?: number
  }

  interface CropperInstance {
    getCroppedCanvas(options?: {
      width?: number
      height?: number
      imageSmoothingEnabled?: boolean
      imageSmoothingQuality?: string
    }): HTMLCanvasElement | null
  }

  const VueCropper: DefineComponent<{
    src: string
    aspectRatio?: number
    viewMode?: number
    dragMode?: string
    autoCropArea?: number
    background?: boolean
    responsive?: boolean
    restore?: boolean
    checkCrossOrigin?: boolean
    checkOrientation?: boolean
    modal?: boolean
    guides?: boolean
    center?: boolean
    highlight?: boolean
    cropBoxMovable?: boolean
    cropBoxResizable?: boolean
    toggleDragModeOnDblclick?: boolean
    size?: number
    minContainerWidth?: number
    minContainerHeight?: number
    minCanvasWidth?: number
    minCanvasHeight?: number
    minCropBoxWidth?: number
    minCropBoxHeight?: number
    ready?: () => void
    cropstart?: () => void
    cropmove?: () => void
    cropend?: () => void
    crop?: () => void
    zoom?: () => void
  }>

  export default VueCropper
}
