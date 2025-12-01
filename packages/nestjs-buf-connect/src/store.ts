import type { DescService } from '@bufbuild/protobuf';

/**
 * Metadata store that maps controller class names to their Connect RPC service descriptors.
 * This is populated by the @ConnectService decorator and used by the router
 * to register services with the ConnectRouter.
 */
export const metadataStore = new Map<string, DescService>();
