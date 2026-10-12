// Leads are Indian mobiles stored as 10 digits (API phone.util.ts).
export const telHref = (phone: string) => `tel:+91${phone}`
export const whatsappHref = (phone: string) => `https://wa.me/91${phone}`
