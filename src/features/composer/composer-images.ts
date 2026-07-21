export const maxComposerImages = 4
const maxComposerImageDimension = 1600
const maxComposerImageBytes = 350 * 1024

export interface ComposerImage {
  id: string
  data: string
  mimeType: 'image/jpeg'
}

/** Réduit chaque image collée sous la limite HTTP tout en préservant une résolution utile au modèle. */
export async function prepareComposerImage(file: File): Promise<ComposerImage | null> {
  const source = await loadImageSource(file)
  let width = Math.min(source.width, maxComposerImageDimension)
  let height = Math.round(source.height * (width / source.width))
  if (height > maxComposerImageDimension) {
    height = maxComposerImageDimension
    width = Math.round(source.width * (height / source.height))
  }

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error("La compression d'image n'est pas disponible dans ce navigateur.")
  for (;;) {
    canvas.width = width
    canvas.height = height
    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)
    context.drawImage(source, 0, 0, width, height)
    for (const quality of [0.84, 0.72, 0.6, 0.5]) {
      const blob = await canvasToBlob(canvas, quality)
      if (blob.size <= maxComposerImageBytes) return { id: crypto.randomUUID(), data: await blobToBase64(blob), mimeType: 'image/jpeg' }
    }
    if (Math.max(width, height) <= 640) return null
    width = Math.round(width * 0.8)
    height = Math.round(height * 0.8)
  }
}

/** Charge un fichier image dans un élément compatible Canvas et libère son URL temporaire dès le décodage. */
function loadImageSource(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("L'image collée est illisible.")) }
    image.src = url
  })
}

/** Encode le canvas en JPEG afin d'éviter que les captures PNG ne dépassent la limite de requête locale. */
function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("L'image n'a pas pu être compressée.")), 'image/jpeg', quality))
}

/** Retire l'en-tête data URL, absent du format base64 attendu par le protocole RPC de Pi. */
async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error("L'image n'a pas pu être lue."))
    reader.onerror = () => reject(reader.error ?? new Error("L'image n'a pas pu être lue."))
    reader.readAsDataURL(blob)
  })
  return dataUrl.slice(dataUrl.indexOf(',') + 1)
}
