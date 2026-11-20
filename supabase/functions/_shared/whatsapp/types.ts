// Tipos del webhook de WhatsApp Cloud API (solo los campos que Teo usa).
// https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components

export interface WebhookPayload {
  object?: string;
  entry?: WebhookEntry[];
}

export interface WebhookEntry {
  id?: string; // WABA id
  changes?: WebhookChange[];
}

export interface WebhookChange {
  field?: string;
  value?: WebhookValue;
}

export interface WebhookValue {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
  messages?: WaMessage[];
  statuses?: WaStatus[];
  errors?: WaError[];
}

export interface WaMedia {
  id: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
  filename?: string;
  voice?: boolean;
}

export interface WaMessage {
  from: string;
  id: string;
  timestamp?: string;
  type: string;
  context?: { from?: string; id?: string };
  text?: { body: string };
  image?: WaMedia;
  document?: WaMedia;
  audio?: WaMedia;
  video?: WaMedia;
  sticker?: WaMedia;
  location?: { latitude: number; longitude: number; name?: string; address?: string; url?: string };
  interactive?: {
    type: "button_reply" | "list_reply" | string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  button?: { payload?: string; text?: string };
  reaction?: { message_id: string; emoji?: string };
  errors?: WaError[];
}

export interface WaStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed" | string;
  timestamp?: string;
  recipient_id?: string;
  errors?: WaError[];
}

export interface WaError {
  code?: number;
  title?: string;
  message?: string;
  error_data?: { details?: string };
}
