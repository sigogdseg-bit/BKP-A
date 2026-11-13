export interface PassoFotoGuia {
  id: "placa" | "rastreador" | "local" | "bloqueador";
  numero: number;
  titulo: string;
  imagemModeloUrl: string;
  requerBloqueador?: boolean;
}

export const PASSOS_FOTOS_GUIA: PassoFotoGuia[] = [
  {
    id: "placa",
    numero: 1,
    titulo: "Frente do Veículo e Placa",
    imagemModeloUrl: "/assets/esbocos/esboco_frente_placa_v2.jpg",
  },
  {
    id: "rastreador",
    numero: 2,
    titulo: "Rastreador e Etiqueta do IMEI",
    imagemModeloUrl: "/assets/esbocos/esboco_rastreador_imei_v2.jpg",
  },
  {
    id: "local",
    numero: 3,
    titulo: "Ponto de Instalação",
    imagemModeloUrl: "/assets/esbocos/esboco_local_instalado_v2.jpg",
  },
  {
    id: "bloqueador",
    numero: 4,
    titulo: "Relé de Bloqueio Instalado",
    imagemModeloUrl: "/assets/esbocos/esboco_bloqueador_rele_v2.jpg",
    requerBloqueador: true,
  },
];
