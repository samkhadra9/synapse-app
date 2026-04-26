/**
 * CP6.1 — attachment picker
 *
 * Presents the iOS file picker for PDFs and reads the selected file as
 * base64 so the Chat screen can attach it to the next user turn as a
 * Claude `document` content block.
 *
 * Why base64? Anthropic's PDF support takes a `{type: 'document', source:
 * {type: 'base64', media_type: 'application/pdf', data: '...'}}` block.
 * The proxy passes our request body through verbatim, so all the work
 * happens client-side: pick file → read base64 → push as content block.
 *
 * Limits we enforce here:
 *   - Only PDFs (CP6.1 — images are CP6.3).
 *   - Cap at ~30MB to stay under Anthropic's 32MB ceiling and keep the
 *     proxy / upload latency sane on cellular.
 *
 * Errors return `null` and surface to the caller via a one-line toast —
 * we don't throw because picker dismissal is the most common path and
 * shouldn't read like a crash.
 */
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
// SDK 54 swapped the old procedural `readAsStringAsync` API for a
// class-based one. We use the new `File(uri).base64()` shape — same
// result, no more `EncodingType` enum.
import { File } from 'expo-file-system';
import type { ChatAttachment } from '../store/useStore';

/**
 * Hard ceiling.
 *
 * Anthropic accepts up to 32MB per PDF on the messages API, but our
 * Supabase Edge Function proxy has a ~10MB request body cap. A raw PDF
 * encodes ≈4/3 larger as base64, so a ~7MB raw file lands around ~9.5MB
 * post-encoding — leaves headroom for the rest of the JSON envelope.
 *
 * Users running on their own personal Anthropic key (direct call) could
 * in theory carry larger files, but we keep one limit for both paths to
 * avoid a confusing "works for power users only" failure mode.
 */
const MAX_BYTES = 7 * 1024 * 1024;

export type PickResult =
  | { kind: 'ok'; attachment: ChatAttachment }
  | { kind: 'cancelled' }
  | { kind: 'too_large'; sizeKB: number }
  | { kind: 'error'; message: string };

/**
 * Open the iOS document picker filtered to PDFs. Returns the file
 * encoded as base64 along with a small metadata record suitable for
 * stashing on a chat message.
 */
export async function pickPdfAttachment(): Promise<PickResult> {
  let res: DocumentPicker.DocumentPickerResult;
  try {
    res = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true, // expo-file-system needs a readable URI
      multiple: false,
    });
  } catch (err: any) {
    return { kind: 'error', message: err?.message ?? 'Picker failed to open' };
  }

  if (res.canceled) return { kind: 'cancelled' };

  const asset = res.assets?.[0];
  if (!asset?.uri) return { kind: 'error', message: 'No file returned' };

  // Bail before we try to read megabytes of base64 into memory.
  if (typeof asset.size === 'number' && asset.size > MAX_BYTES) {
    return { kind: 'too_large', sizeKB: Math.round(asset.size / 1024) };
  }

  let b64: string;
  try {
    const file = new File(asset.uri);
    b64 = await file.base64();
  } catch (err: any) {
    return { kind: 'error', message: err?.message ?? 'Could not read file' };
  }

  // Approx size (in bytes) of the original file from the b64 length.
  // Roughly ceil(len * 3 / 4) - padding; we don't need precision here.
  const approxBytes = Math.floor((b64.length * 3) / 4);
  if (approxBytes > MAX_BYTES) {
    return { kind: 'too_large', sizeKB: Math.round(approxBytes / 1024) };
  }

  return {
    kind: 'ok',
    attachment: {
      kind: 'pdf',
      name: asset.name ?? 'document.pdf',
      mediaType: asset.mimeType ?? 'application/pdf',
      sizeKB: Math.round(approxBytes / 1024),
      b64,
    },
  };
}

/**
 * CP6.3 — open the photo library, return the chosen image as a base64
 * payload ready to ride a Claude `image` content block.
 *
 * We pull `image/jpeg` and `image/png` (the formats Anthropic supports
 * universally — webp + gif are technically allowed but inconsistent
 * across older iOS photo formats like HEIC). We don't crop or compress
 * here; if the user picked a 12MP photo we just enforce the size cap
 * and surface a friendly error if it's too big.
 */
export async function pickImageAttachment(): Promise<PickResult> {
  // Request library permission lazily — Apple's review team prefers a
  // permission prompt scoped to the moment of use rather than at launch.
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    return { kind: 'error', message: 'Photo access not granted' };
  }

  let res: ImagePicker.ImagePickerResult;
  try {
    res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.85, // gentle compression — keeps JPEG quality high but trims megapixel files
      base64: true,  // expo-image-picker can return base64 directly, saves a file read
    });
  } catch (err: any) {
    return { kind: 'error', message: err?.message ?? 'Picker failed to open' };
  }

  if (res.canceled) return { kind: 'cancelled' };

  const asset = res.assets?.[0];
  if (!asset?.uri) return { kind: 'error', message: 'No image returned' };

  // expo-image-picker on iOS returns mimeType only sometimes; default to
  // jpeg, which is what `quality: <number>` produces. Anthropic accepts
  // `image/jpeg`, `image/png`, `image/gif`, `image/webp`.
  const mediaType = asset.mimeType ?? 'image/jpeg';
  if (!/^image\/(jpeg|png|gif|webp)$/.test(mediaType)) {
    return { kind: 'error', message: `Unsupported image type: ${mediaType}` };
  }

  // Either the picker handed us base64 directly, or we read the file.
  let b64 = asset.base64 ?? null;
  if (!b64) {
    try {
      const file = new File(asset.uri);
      b64 = await file.base64();
    } catch (err: any) {
      return { kind: 'error', message: err?.message ?? 'Could not read image' };
    }
  }

  const approxBytes = Math.floor((b64.length * 3) / 4);
  if (approxBytes > MAX_BYTES) {
    return { kind: 'too_large', sizeKB: Math.round(approxBytes / 1024) };
  }

  return {
    kind: 'ok',
    attachment: {
      kind: 'image',
      name: asset.fileName ?? 'photo.jpg',
      mediaType,
      sizeKB: Math.round(approxBytes / 1024),
      b64,
    },
  };
}

/**
 * Build the Anthropic `messages` content array for a single user turn
 * that may carry an attachment. When there's no attachment we keep the
 * plain-string shape Claude accepts on either path.
 *
 * NOTE: when the message is restored from persistence, `b64` is stripped
 * (see `appendChatSessionMessage`). In that case we fall back to a plain
 * text turn — the model already saw the file on the original send.
 */
export function buildAnthropicContent(
  msg: { content: string; attachment?: ChatAttachment | undefined },
): string | Array<Record<string, unknown>> {
  const a = msg.attachment;
  if (!a?.b64) return msg.content;

  const blocks: Array<Record<string, unknown>> = [];

  if (a.kind === 'pdf') {
    blocks.push({
      type: 'document',
      source: { type: 'base64', media_type: a.mediaType, data: a.b64 },
    });
  } else if (a.kind === 'image') {
    blocks.push({
      type: 'image',
      source: { type: 'base64', media_type: a.mediaType, data: a.b64 },
    });
  }

  // Always append the user's text — even if empty, so the model has a
  // turn to reply to. ("Here's the deck" / "" both work for Claude.)
  blocks.push({ type: 'text', text: msg.content || ' ' });
  return blocks;
}
