import { FILE_MEDIA_TYPES } from '@alfred/contracts';
import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ApiErrors, ApiRoute, type ApiProblem } from '../../../common/api-docs/api-docs.decorators';
import { FILES_ACCESS_PROBLEMS, FILES_NOT_FOUND, FilesIdParam } from './files-shared.openapi';

const binary = (example: string) => ({ schema: { type: 'string', format: 'binary' }, example });

const header = (description: string, example: string | number) => ({
  description,
  schema: { type: typeof example === 'number' ? 'integer' : 'string', example },
});

/** What `toDownload` and the two `@Header` lines of the controller put on every download. */
const downloadHeaders = (disposition: string, dispositionNote: string, length: number) => ({
  'Content-Disposition': header(
    `Always \`attachment\`, never \`inline\`: user bytes are not rendered from the origin of the application. Carries the name of the file twice (RFC 6266): an ASCII fallback in \`filename\`, where any other character, \`"\` and \`\\\` become \`_\`, and the exact UTF-8 name, percent-encoded, in \`filename*\`. ${dispositionNote}`,
    disposition,
  ),
  'Content-Length': header('Size of the body in bytes.', length),
  'Cache-Control': header(
    'Always `private, no-store`: neither a shared cache nor the browser keeps the bytes.',
    'private, no-store',
  ),
  'X-Content-Type-Options': header(
    'Always `nosniff`: the declared `Content-Type` is the detected one and must not be guessed again.',
    'nosniff',
  ),
});

const CONTENT_PURGED: ApiProblem = {
  status: 410,
  code: 'file_content_purged',
  message: 'The file content is no longer stored.',
  when: 'The library entry exists but the storage no longer holds these bytes. Retrying does not help; the entry can still be deleted.',
};

const BEARER_ONLY =
  'The access token goes in the `Authorization` header like everywhere else: no cookie and no query parameter carries it, so a plain link, an `<img src>` or an `<iframe>` cannot call this route. Fetch it, then hand the bytes to the user (a blob URL, a save dialog).';

export const DocDownloadFileContent = () =>
  applyDecorators(
    ApiRoute(
      'Download the original bytes of a file',
      `Answers the exact bytes that were uploaded, not JSON. The whole file comes in one answer: ranges are not supported.

- \`Content-Type\` is the type detected from the bytes at upload (the \`mediaType\` of the file), never one a client declared.
- Available whatever the \`readiness\`: a \`processing\` or a \`failed\` file downloads too.
- ${BEARER_ONLY}
- Errors are the usual JSON envelope, so check the status before reading the body as a file.`,
    ),
    FilesIdParam(),
    ApiResponse({
      status: 200,
      description:
        'The original file. One of the media types below, the `mediaType` of the file, with the headers listed.',
      headers: downloadHeaders(
        `attachment; filename="Contrat cadre.pdf"; filename*=UTF-8''Contrat%20cadre.pdf`,
        'The name is the `name` of the file.',
        482_113,
      ),
      content: {
        [FILE_MEDIA_TYPES.pdf]: binary('(binary) the PDF as it was uploaded, starting with %PDF-'),
        [FILE_MEDIA_TYPES.docx]: binary('(binary) the DOCX as it was uploaded, a ZIP container'),
        [FILE_MEDIA_TYPES.png]: binary('(binary) the PNG as it was uploaded'),
        [FILE_MEDIA_TYPES.jpeg]: binary('(binary) the JPEG as it was uploaded'),
        [FILE_MEDIA_TYPES.webp]: binary('(binary) the WebP as it was uploaded'),
        [FILE_MEDIA_TYPES.gif]: binary('(binary) the GIF as it was uploaded'),
      },
    }),
    ApiErrors(FILES_NOT_FOUND, ...FILES_ACCESS_PROBLEMS, CONTENT_PURGED),
  );

export const DocDownloadFilePreview = () =>
  applyDecorators(
    ApiRoute(
      'Download the reduced copy of an image',
      `Answers a smaller JPEG of an image of the library, meant for thumbnails. Not JSON. It is the copy prepared while the image was \`processing\`, the one the model receives when the image is attached.

- **Images only, and only once \`ready\`.** A PDF, a DOCX, an image still \`processing\` and a \`failed\` image have no reduced copy: the answer is the same \`404 file_not_found\` as for an unknown file. Read \`kind\` and \`readiness\` first instead of probing.
- Always \`image/jpeg\`, whatever the original type: longest edge of at most 1 568 pixels by default (a deployment setting), never enlarged, rotated as its EXIF orientation says, transparency flattened on white, first frame of an animation, and no metadata left (EXIF, GPS).
- ${BEARER_ONLY}`,
    ),
    FilesIdParam(),
    ApiResponse({
      status: 200,
      description: 'The reduced copy, always a JPEG, with the headers listed.',
      headers: downloadHeaders(
        `attachment; filename="Sch_ma r_seau.png"; filename*=UTF-8''Sch%C3%A9ma%20r%C3%A9seau.png`,
        'The name is the `name` of the file unchanged, so it keeps the extension of the original (`.png` here) although the bytes are a JPEG.',
        96_412,
      ),
      content: {
        [FILE_MEDIA_TYPES.jpeg]: binary('(binary) a JPEG, starting with the bytes FF D8 FF'),
      },
    }),
    ApiErrors(
      {
        ...FILES_NOT_FOUND,
        when: 'The file does not exist, was deleted, belongs to another account, the identifier is not a UUID, **or the file has no reduced copy**: it is not an image, or it is not `ready`. All indistinguishable by design.',
      },
      ...FILES_ACCESS_PROBLEMS,
      {
        ...CONTENT_PURGED,
        when: 'The image exists but the storage no longer holds its reduced copy. Retrying does not help; fall back to the original.',
      },
    ),
  );
