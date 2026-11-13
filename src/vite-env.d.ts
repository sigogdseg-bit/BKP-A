/// <reference types="vite/client" />

declare module "*.css?url" {
  const content: string;
  export default content;
}

declare module "@tanstack/react-router" {
  export const createFileRoute: any;
  export const Link: any;
  export const redirect: any;
  export const useNavigate: any;
  export const useRouter: any;
  export const useSearch: any;
  export const useParams: any;
  export const useLocation: any;
  export const useRouterState: any;
  export const Outlet: any;
  export const createRootRouteWithContext: <T = any>() => (options?: any) => any;
  export const createRouter: any;
  export const ErrorComponent: any;
  export const HeadContent: any;
  export const Scripts: any;
}

declare module "jspdf" {
  export class jsPDF {
    constructor(options?: any);
    [key: string]: any;
  }
  export default jsPDF;
}

declare module "jspdf-autotable" {
  const autoTable: any;
  export default autoTable;
}

declare module "@tanstack/react-query" {
  export const useQuery: any;
  export const useMutation: any;
  export const useQueryClient: any;
  export const QueryClientProvider: any;
  export class QueryClient {
    constructor(config?: any);
    [key: string]: any;
  }
}

declare module "sonner" {
  export const toast: any;
  export const Toaster: any;
}

declare module "@supabase/supabase-js" {
  export const createClient: <T = any>(url: string, key: string, options?: any) => any;
  export type SupabaseClient<T = any> = any;
  export type User = any;
  export type Session = any;
}

declare module "leaflet" {
  const L: any;
  export default L;
}

declare module "maplibre-gl" {
  const maplibregl: any;
  export const Map: any;
  export const Marker: any;
  export const Popup: any;
  export const NavigationControl: any;
  export const LngLatBounds: any;
  export default maplibregl;
}
