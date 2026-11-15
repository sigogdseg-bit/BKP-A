import { useEffect, useRef, useState } from "react";
import {
  X,
  Camera,
  ScanLine,
  Keyboard,
  Check,
  AlertCircle,
  RefreshCw,
  Upload,
  Zap,
  Image as ImageIcon,
} from "lucide-react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { toast } from "sonner";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { conferirCorrespondenciaIdentificador } from "@/shared/utils/conferenciaIdentificador";

interface CameraBarcodeScannerModalProps {
  open: boolean;
  onClose: () => void;
  onScanSucesso: (codigo: string) => void;
  titulo?: string;
  subtitulo?: string;
  valorEsperado?: string;
}

export function CameraBarcodeScannerModal({
  open,
  onClose,
  onScanSucesso,
  titulo = "Leitor de Código de Barras / IMEI",
  subtitulo = "Aponte a câmera para o código de barras ou use a foto em alta resolução.",
  valorEsperado,
}: CameraBarcodeScannerModalProps) {
  const containerId = "hunter-barcode-reader-container";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const barcodeDetectorIntervalRef = useRef<any>(null);

  const [iniciandoCamera, setIniciandoCamera] = useState(true);
  const [erroCamera, setErroCamera] = useState<string | null>(null);
  const [codigoDigitado, setCodigoDigitado] = useState("");
  const [camerasDisponiveis, setCamerasDisponiveis] = useState<any[]>([]);
  const [cameraSelecionada, setCameraSelecionada] = useState<string>("");
  const [processandoArquivo, setProcessandoArquivo] = useState(false);
  const [lanternaLigada, setLanternaLigada] = useState(false);
  const [suportaLanterna, setSuportaLanterna] = useState(false);

  // Feedback sonoro e tátil leve ao ler com sucesso
  const emitirSinalLeitura = () => {
    try {
      if (typeof window !== "undefined" && "navigator" in window && navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // Nota Lá (A5)
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch {
      // Ignora falhas de áudio
    }
  };

  const processarCodigoLido = (rawCode: string, isManual = false) => {
    if (!rawCode) return;
    const codigoBruto = rawCode.trim();
    if (!codigoBruto) return;

    // Utiliza o módulo canônico inegociável de conferência de identificadores
    const resultado = conferirCorrespondenciaIdentificador(codigoBruto, valorEsperado);

    if (resultado.confere) {
      emitirSinalLeitura();
      toast.success(resultado.mensagem);
      pararScanner();
      onScanSucesso(resultado.valorFormatado);
      onClose();
      return;
    }

    // Se houve divergência do valor esperado
    if (valorEsperado) {
      toast.error(resultado.mensagem);
      return;
    }

    // Leitura por câmera sem valor esperado: filtra ruído visual de menos de 3 caracteres
    if (!isManual && codigoBruto.length < 3) {
      toast.error("Código de barras não reconhecido ou muito curto. Tente novamente.");
      return;
    }

    emitirSinalLeitura();
    toast.success(resultado.mensagem);
    pararScanner();
    onScanSucesso(resultado.valorFormatado);
    onClose();
  };

  const isStartingRef = useRef(false);
  const activeTracksRef = useRef<MediaStreamTrack[]>([]);

  const pararScanner = async () => {
    if (barcodeDetectorIntervalRef.current) {
      clearInterval(barcodeDetectorIntervalRef.current);
      barcodeDetectorIntervalRef.current = null;
    }

    if (scannerRef.current) {
      const scanner = scannerRef.current;
      scannerRef.current = null;
      try {
        if (scanner.isScanning) {
          await scanner.stop();
        }
        await scanner.clear();
      } catch (err) {
        console.warn("Aviso ao encerrar scanner de câmera:", err);
      }
    }

    // Desligamento físico garantido de hardware para apagar o LED/indicador da câmera imediatamente
    if (activeTracksRef.current.length > 0) {
      activeTracksRef.current.forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignora erro no desligamento preventivo do track
        }
      });
      activeTracksRef.current = [];
    }

    try {
      const container = document.getElementById(containerId);
      if (container) {
        const videoEls = container.querySelectorAll("video");
        videoEls.forEach((v) => {
          const stream = v.srcObject as MediaStream | null;
          if (stream) {
            stream.getTracks().forEach((track) => {
              try {
                track.stop();
              } catch {
                // Ignora erro de liberação de hardware
              }
            });
            v.srcObject = null;
          }
        });
      }
    } catch (e) {
      console.warn("Aviso ao interromper tracks de câmera:", e);
    }
  };

  // Tenta ativar aceleração nativa via BarcodeDetector API do navegador se disponível
  const iniciarBarcodeDetectorNativo = () => {
    if (typeof window === "undefined" || !("BarcodeDetector" in window)) return;

    try {
      const detector = new (window as any).BarcodeDetector({
        formats: [
          "code_128",
          "code_39",
          "code_93",
          "codabar",
          "data_matrix",
          "itf",
          "ean_13",
          "ean_8",
          "upc_a",
          "upc_e",
          "qr_code",
          "pdf417",
          "aztec",
        ],
      });

      barcodeDetectorIntervalRef.current = setInterval(async () => {
        try {
          const videoEl = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
          if (videoEl && videoEl.readyState >= 2) {
            const barcodes = await detector.detect(videoEl);
            if (barcodes && barcodes.length > 0) {
              const rawValue = barcodes[0].rawValue;
              if (rawValue) {
                processarCodigoLido(rawValue);
              }
            }
          }
        } catch {
          // Ignora frames sem código
        }
      }, 150);
    } catch (err) {
      console.warn("BarcodeDetector nativo não suportado ou erro de inicialização:", err);
    }
  };

  const alternarLanterna = async () => {
    if (!scannerRef.current) return;
    try {
      const novoEstado = !lanternaLigada;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: novoEstado }] as any,
      });
      setLanternaLigada(novoEstado);
    } catch (err) {
      toast.error("Não foi possível acionar o flash deste dispositivo.");
    }
  };

  const iniciarScanner = async (cameraIdAlvo?: string) => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    setIniciandoCamera(true);
    setErroCamera(null);

    try {
      await pararScanner();

      // Suporte completo a todos os padrões industriais de códigos 1D e 2D
      const todosFormatos = [
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.CODE_93,
        Html5QrcodeSupportedFormats.CODABAR,
        Html5QrcodeSupportedFormats.DATA_MATRIX,
        Html5QrcodeSupportedFormats.ITF,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.UPC_EAN_EXTENSION,
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.PDF_417,
        Html5QrcodeSupportedFormats.AZTEC,
        Html5QrcodeSupportedFormats.RSS_14,
        Html5QrcodeSupportedFormats.RSS_EXPANDED,
      ];

      const html5QrCode = new Html5Qrcode(containerId, {
        formatsToSupport: todosFormatos,
        verbose: false,
      });
      scannerRef.current = html5QrCode;

      const devices = await Html5Qrcode.getCameras().catch(() => []);
      setCamerasDisponiveis(devices);

      let configCamera: any = { facingMode: "environment" };

      if (cameraIdAlvo) {
        configCamera = { deviceId: { exact: cameraIdAlvo } };
        setCameraSelecionada(cameraIdAlvo);
      } else if (devices.length > 0) {
        const traseira = devices.find((d) => {
          const label = (d.label || "").toLowerCase();
          return (
            label.includes("back") ||
            label.includes("traseira") ||
            label.includes("environment") ||
            label.includes("rear")
          );
        });
        if (traseira) {
          configCamera = { deviceId: { exact: traseira.id } };
          setCameraSelecionada(traseira.id);
        } else {
          // Notebook ou câmera frontal única (FaceTime HD do Mac)
          configCamera = { deviceId: { exact: devices[0].id } };
          setCameraSelecionada(devices[0].id);
        }
      }

      await html5QrCode.start(
        configCamera,
        {
          fps: 20,
          aspectRatio: 1.333333,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const w = Math.max(260, Math.floor(viewfinderWidth * 0.92));
            const h = Math.max(140, Math.floor(viewfinderHeight * 0.65));
            return { width: w, height: h };
          },
        },
        (decodedText) => {
          processarCodigoLido(decodedText);
        },
        () => {
          // Ignora frames sem código
        },
      );

      // Captura tracks de mídia ativas para garantir desligamento físico de hardware
      try {
        const container = document.getElementById(containerId);
        const videoEl = container?.querySelector("video") as HTMLVideoElement | null;
        if (videoEl && videoEl.srcObject) {
          const stream = videoEl.srcObject as MediaStream;
          activeTracksRef.current = stream.getTracks();
          videoEl.play().catch(() => {});
        }
      } catch {
        // Ignora erro se stream não estiver acessível
      }

      // Checa suporte a flash/lanterna
      try {
        const capabilities = html5QrCode.getRunningTrackCapabilities() as any;
        if (capabilities?.torch) {
          setSuportaLanterna(true);
        }
      } catch {
        setSuportaLanterna(false);
      }

      iniciarBarcodeDetectorNativo();
      setIniciandoCamera(false);
    } catch (err: any) {
      console.warn("Falha ao abrir câmera para leitura de código:", err);
      setErroCamera(
        err?.message ||
          "Não foi possível acessar a câmera do dispositivo. Verifique as permissões do navegador ou capture uma foto do código.",
      );
      setIniciandoCamera(false);
    } finally {
      isStartingRef.current = false;
    }
  };

  const trocarCamera = async (camId: string) => {
    setCameraSelecionada(camId);
    await iniciarScanner(camId);
  };

  // Processa arquivo ou foto capturada em alta resolução
  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProcessandoArquivo(true);
    try {
      let scanner = scannerRef.current;
      if (!scanner) {
        scanner = new Html5Qrcode(containerId, { verbose: false });
        scannerRef.current = scanner;
      } else if (scanner.isScanning) {
        await scanner.stop().catch(() => {});
      }

      const decodedText = await scanner.scanFile(file, true);
      processarCodigoLido(decodedText);
    } catch (err: any) {
      toast.error(
        "Não foi possível decodificar o código de barras na foto. Tente aproximar e garantir boa iluminação, ou digite o número.",
      );
    } finally {
      setProcessandoArquivo(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  useEffect(() => {
    let montado = true;
    if (open) {
      const t = setTimeout(() => {
        if (montado) {
          iniciarScanner();
        }
      }, 150);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          pararScanner();
          onClose();
        }
      };
      window.addEventListener("keydown", handleKeyDown);

      return () => {
        montado = false;
        clearTimeout(t);
        window.removeEventListener("keydown", handleKeyDown);
        pararScanner();
      };
    } else {
      pararScanner();
    }
    return () => {
      pararScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);

  const handleSubmitManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!codigoDigitado.trim()) {
      toast.error("Digite o código ou IMEI.");
      return;
    }
    processarCodigoLido(codigoDigitado, true);
  };

  if (!open) return null;

  return (
    <ModalPortal>
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            pararScanner();
            onClose();
          }
        }}
        className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-fadeIn"
      >
        <div className="relative w-full max-w-lg bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto transition-colors">
          {/* Input oculto para carregar ou tirar foto com câmera nativa */}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={fileInputRef}
            onChange={handleFileScan}
            className="hidden"
          />

          {/* Cabeçalho */}
          <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-950/50 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">
                <ScanLine className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">{titulo}</h3>
                <p className="text-[11px] text-slate-500 line-clamp-1">{subtitulo}</p>
              </div>
            </div>

            <button
              onClick={() => {
                pararScanner();
                onClose();
              }}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0"
              title="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Corpo */}
          <div className="p-4 sm:p-5 space-y-3.5 overflow-y-auto custom-scrollbar flex-1">
            {valorEsperado && (
              <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-700 dark:text-sky-300 text-xs flex items-center justify-between gap-2">
                <span className="font-bold">Código / IMEI Esperado:</span>
                <span className="font-mono font-black text-sm bg-white dark:bg-slate-950 px-2 py-0.5 rounded-lg border border-sky-500/30">
                  {valorEsperado}
                </span>
              </div>
            )}

            {/* Visualizador da Câmera com Mira Ampla */}
            <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 aspect-4/3 flex items-center justify-center shadow-inner">
              <style>{`
                #${containerId} {
                  width: 100% !important;
                  height: 100% !important;
                  position: absolute !important;
                  inset: 0 !important;
                  overflow: hidden !important;
                }
                #${containerId} video {
                  width: 100% !important;
                  height: 100% !important;
                  object-fit: cover !important;
                  display: block !important;
                }
                #${containerId} #qr-shaded-region {
                  display: none !important;
                }
                #${containerId} canvas {
                  display: none !important;
                }
              `}</style>
              <div id={containerId} className="absolute inset-0 w-full h-full" />

              {/* Mira e Laser Animado */}
              {!iniciandoCamera && !erroCamera && (
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
                  <div className="relative w-[92%] h-[68%] border-2 border-dashed border-amber-400/80 rounded-2xl flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                    {/* Linha laser de varredura animada */}
                    <div className="absolute w-full h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_10px_#f59e0b] animate-bounce" />
                    <span className="text-[10px] font-mono font-bold text-amber-300 bg-slate-950/90 px-2.5 py-1 rounded-full border border-amber-400/40 shadow-sm">
                      Enquadre o código de barras
                    </span>
                  </div>
                </div>
              )}

              {/* Botões Flutuantes sobre o vídeo (Flash e Alternador) */}
              {!iniciandoCamera && !erroCamera && (
                <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10">
                  {suportaLanterna && (
                    <button
                      type="button"
                      onClick={alternarLanterna}
                      className={`p-2 rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-md ${
                        lanternaLigada
                          ? "bg-amber-400 text-slate-950 shadow-amber-400/30"
                          : "bg-slate-900/80 text-white hover:bg-slate-800"
                      }`}
                      title={lanternaLigada ? "Desligar Lanterna" : "Ligar Lanterna"}
                    >
                      <Zap className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}

              {iniciandoCamera && (
                <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <RefreshCw className="h-6 w-6 animate-spin text-amber-500" />
                  <span className="text-xs font-mono">Iniciando câmera e autofoco...</span>
                </div>
              )}

              {erroCamera && (
                <div className="absolute inset-0 bg-slate-950/95 p-4 flex flex-col items-center justify-center text-center text-rose-400 gap-2">
                  <AlertCircle className="h-7 w-7 text-rose-500" />
                  <p className="text-xs">{erroCamera}</p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-2 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition"
                  >
                    Tirar Foto com a Câmera do Celular
                  </button>
                </div>
              )}

              {processandoArquivo && (
                <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center text-amber-400 gap-2">
                  <RefreshCw className="h-6 w-6 animate-spin" />
                  <span className="text-xs font-mono font-bold">
                    Processando foto em alta resolução...
                  </span>
                </div>
              )}
            </div>

            {/* Ações Rápidas: Alternar Câmera e Tirar Foto de Alta Resolução */}
            <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
              <div className="flex items-center gap-1.5 flex-1 min-w-[140px]">
                {camerasDisponiveis.length > 1 && (
                  <select
                    value={cameraSelecionada}
                    onChange={(e) => trocarCamera(e.target.value)}
                    className="w-full p-2 text-[11px] rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-sans text-slate-800 dark:text-slate-200"
                  >
                    {camerasDisponiveis.map((cam) => (
                      <option key={cam.id} value={cam.id}>
                        {cam.label || `Câmera ${cam.id.slice(0, 8)}...`}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Botão de Tirar Foto / Carregar da Galeria (Garante foco perfeito em qualquer celular) */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5 transition border border-slate-200 dark:border-slate-700"
                title="Tirar foto focada ou escolher da galeria caso a câmera em tempo real não consiga focar"
              >
                <ImageIcon className="h-3.5 w-3.5 text-amber-500" />
                <span>Tirar Foto Nítida</span>
              </button>
            </div>

            {/* Caixa de Digitação Manual Imediata (Sempre Acessível) */}
            <form
              onSubmit={handleSubmitManual}
              className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2"
            >
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Keyboard className="h-3.5 w-3.5 text-amber-500" />
                  <span>Digitar IMEI ou Código Manualmente</span>
                </label>
                <span className="text-[10px] font-mono font-bold text-amber-600 dark:text-amber-400">
                  {valorEsperado ? `Esperado: ${valorEsperado}` : "IMEI ou serial"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={codigoDigitado}
                  onChange={(e) => setCodigoDigitado(e.target.value)}
                  placeholder={valorEsperado ? `Ex: ${valorEsperado}` : "Ex: 869890084890007"}
                  className="flex-1 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 font-mono text-xs font-bold text-slate-900 dark:text-slate-100 tracking-wider focus:border-amber-500 focus:outline-none shadow-inner"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1 transition shadow-sm shrink-0"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Confirmar</span>
                </button>
              </div>
            </form>
          </div>

          {/* Rodapé Fixo */}
          <div className="p-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
            <span className="text-[11px] text-slate-500">
              Dica: Mantenha a etiqueta a 15-20cm com iluminação direta.
            </span>
            <button
              type="button"
              onClick={() => {
                pararScanner();
                onClose();
              }}
              className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition min-h-[44px] flex items-center justify-center"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
