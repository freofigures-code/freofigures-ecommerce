import {
  AnimatePresence,
  motion,
} from "motion/react";
import {
  ReactNode,
  useEffect,
  useState,
} from "react";

type FreoIntroProps = {
  children: ReactNode;
};

const INTRO_SESSION_KEY = "freo_intro_seen";

const slices = [
  38, 48, 58, 66, 72, 78, 82, 86, 88,
  90, 88, 84, 78, 70, 62, 52, 42, 30,
];

export default function FreoIntro({
  children,
}: FreoIntroProps) {
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return true;

    return (
      sessionStorage.getItem(INTRO_SESSION_KEY) !== "true"
    );
  });

  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!visible) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const timers = [
      window.setTimeout(() => setPhase(1), 800),
      window.setTimeout(() => setPhase(2), 2100),
      window.setTimeout(() => setPhase(3), 3600),
      window.setTimeout(() => setPhase(4), 5200),
      window.setTimeout(() => {
        sessionStorage.setItem(
          INTRO_SESSION_KEY,
          "true"
        );

        setVisible(false);
      }, 6500),
    ];

    return () => {
      timers.forEach(window.clearTimeout);
      document.body.style.overflow =
        previousOverflow;
    };
  }, [visible]);

  function finishIntro() {
    sessionStorage.setItem(
      INTRO_SESSION_KEY,
      "true"
    );

    setVisible(false);
  }

  return (
    <>
      {children}

      <AnimatePresence>
        {visible && (
          <motion.div
            key="freo-intro"
            className="fixed inset-0 z-[999999] overflow-hidden bg-[#050505] text-[#F5F5F5]"
            initial={{ opacity: 1 }}
            exit={{
              opacity: 0,
              scale: 1.025,
              filter: "blur(12px)",
            }}
            transition={{
              duration: 0.85,
              ease: [0.76, 0, 0.24, 1],
            }}
          >
            {/* BACKGROUND */}
            <div className="pointer-events-none absolute inset-0">
              {/* glow central */}
              <motion.div
                className="absolute left-1/2 top-1/2 h-[60vw] w-[60vw] max-h-[850px] max-w-[850px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  background:
                    "radial-gradient(circle, rgba(221,175,52,0.12) 0%, rgba(221,175,52,0.03) 35%, transparent 70%)",
                }}
                animate={{
                  scale:
                    phase >= 3
                      ? [0.8, 1.15, 1]
                      : 0.75,
                  opacity:
                    phase >= 2 ? 1 : 0.25,
                }}
                transition={{
                  duration: 1.4,
                  ease: [0.16, 1, 0.3, 1],
                }}
              />

              {/* noise */}
              <div
                className="absolute inset-0 opacity-[0.035]"
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='.8'/%3E%3C/svg%3E\")",
                }}
              />

              {/* linhas discretas */}
              <div
                className="absolute inset-0 opacity-[0.025]"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)",
                  backgroundSize: "70px 70px",
                }}
              />
            </div>

            {/* TOP */}
            <motion.div
              className="absolute left-6 right-6 top-6 z-30 flex items-center justify-between md:left-10 md:right-10 md:top-9"
              initial={{
                opacity: 0,
                y: -10,
              }}
              animate={{
                opacity: phase >= 1 ? 1 : 0,
                y: phase >= 1 ? 0 : -10,
              }}
              transition={{
                duration: 0.7,
              }}
            >
              <span className="font-body text-[10px] uppercase tracking-[0.32em] text-white/30 md:text-xs">
                São Paulo · Brasil
              </span>

              <button
                type="button"
                onClick={finishIntro}
                className="group flex items-center gap-3 border-none bg-transparent p-0 font-body text-[10px] uppercase tracking-[0.26em] text-white/40 transition-colors hover:text-white md:text-xs"
              >
                Pular
                <span className="h-px w-7 bg-white/20 transition-all duration-300 group-hover:w-10 group-hover:bg-[#DDAF34]" />
              </button>
            </motion.div>

            {/* CONTEÚDO CENTRAL */}
            <div className="relative z-20 flex h-full w-full items-center justify-center px-6">
              <AnimatePresence mode="wait">
                {/* FASE 0 / LOGO */}
                {phase <= 1 && (
                  <motion.div
                    key="logo"
                    className="absolute flex flex-col items-center justify-center"
                    initial={{
                      opacity: 0,
                      scale: 0.96,
                    }}
                    animate={{
                      opacity: 1,
                      scale: 1,
                    }}
                    exit={{
                      opacity: 0,
                      y: -35,
                      filter: "blur(8px)",
                    }}
                    transition={{
                      duration: 0.8,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                  >
                    <motion.div
                      className="font-display text-[21vw] font-black leading-none tracking-[-0.08em] text-[#F5F5F5] sm:text-[16vw] lg:text-[12vw]"
                      initial={{
                        letterSpacing: "0.06em",
                        filter: "blur(12px)",
                      }}
                      animate={{
                        letterSpacing: "-0.08em",
                        filter: "blur(0px)",
                      }}
                      transition={{
                        duration: 1.15,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                    >
                      FREO
                    </motion.div>

                    <motion.div
                      className="mt-5 h-px bg-[#DDAF34]"
                      initial={{ width: 0 }}
                      animate={{
                        width:
                          phase >= 1 ? 120 : 0,
                      }}
                      transition={{
                        duration: 0.8,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                    />
                  </motion.div>
                )}

                {/* FASE 2 / PROMESSA */}
                {phase === 2 && (
                  <motion.div
                    key="promise"
                    className="absolute flex max-w-5xl flex-col items-center text-center"
                    initial={{
                      opacity: 0,
                      y: 35,
                      filter: "blur(12px)",
                    }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      filter: "blur(0px)",
                    }}
                    exit={{
                      opacity: 0,
                      y: -35,
                      filter: "blur(10px)",
                    }}
                    transition={{
                      duration: 0.85,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                  >
                    <span className="mb-5 font-body text-[10px] uppercase tracking-[0.4em] text-[#DDAF34] md:text-xs">
                      O que antes só existia na sua mente
                    </span>

                    <h1 className="font-display text-[12vw] font-light leading-[0.86] tracking-[-0.055em] md:text-[8vw] lg:text-[6vw]">
                      VOCÊ
                      <br />
                      <span className="font-black">
                        IMAGINA.
                      </span>
                    </h1>
                  </motion.div>
                )}

                {/* FASE 3 / MATERIALIZAÇÃO */}
                {phase === 3 && (
                  <motion.div
                    key="materialize"
                    className="absolute flex h-full w-full items-center justify-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{
                      opacity: 0,
                      scale: 1.1,
                      filter: "blur(8px)",
                    }}
                    transition={{
                      duration: 0.7,
                    }}
                  >
                    <div className="relative flex h-[440px] w-[320px] items-center justify-center md:h-[560px] md:w-[430px]">
                      {/* objeto criado em camadas */}
                      <motion.div
                        className="relative flex w-full flex-col items-center justify-center gap-[3px] md:gap-1"
                        initial={{
                          scale: 0.82,
                        }}
                        animate={{
                          scale: 1,
                        }}
                        transition={{
                          duration: 1.1,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                      >
                        {slices.map(
                          (width, index) => (
                            <motion.div
                              key={index}
                              className="relative h-[10px] rounded-full border border-[#DDAF34]/20 bg-gradient-to-r from-[#5f4512] via-[#DDAF34] to-[#6e5217] shadow-[0_0_20px_rgba(221,175,52,0.06)] md:h-[13px]"
                              style={{
                                width: `${width}%`,
                              }}
                              initial={{
                                opacity: 0,
                                scaleX: 0.2,
                                x:
                                  index % 2 === 0
                                    ? -35
                                    : 35,
                              }}
                              animate={{
                                opacity: 1,
                                scaleX: 1,
                                x: 0,
                              }}
                              transition={{
                                duration: 0.55,
                                delay:
                                  index * 0.045,
                                ease: [
                                  0.16, 1, 0.3, 1,
                                ],
                              }}
                            >
                              <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/25 to-transparent" />
                            </motion.div>
                          )
                        )}
                      </motion.div>

                      {/* scan */}
                      <motion.div
                        className="absolute left-0 right-0 h-px bg-[#DDAF34] shadow-[0_0_18px_3px_rgba(221,175,52,0.8)]"
                        initial={{
                          top: "15%",
                          opacity: 0,
                        }}
                        animate={{
                          top: ["15%", "85%"],
                          opacity: [0, 1, 1, 0],
                        }}
                        transition={{
                          duration: 1.5,
                          ease: "easeInOut",
                        }}
                      />

                      <motion.span
                        className="absolute -bottom-10 whitespace-nowrap font-body text-[10px] uppercase tracking-[0.35em] text-white/35 md:text-xs"
                        initial={{
                          opacity: 0,
                        }}
                        animate={{
                          opacity: 1,
                        }}
                        transition={{
                          delay: 0.65,
                          duration: 0.7,
                        }}
                      >
                        Ideia → matéria
                      </motion.span>
                    </div>
                  </motion.div>
                )}

                {/* FASE FINAL */}
                {phase >= 4 && (
                  <motion.div
                    key="final"
                    className="absolute flex w-full max-w-6xl flex-col items-center text-center"
                    initial={{
                      opacity: 0,
                      scale: 0.94,
                      filter: "blur(14px)",
                    }}
                    animate={{
                      opacity: 1,
                      scale: 1,
                      filter: "blur(0px)",
                    }}
                    transition={{
                      duration: 0.9,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                  >
                    <motion.span
                      className="mb-5 font-body text-[10px] uppercase tracking-[0.45em] text-[#DDAF34] md:text-xs"
                      initial={{
                        opacity: 0,
                        y: 10,
                      }}
                      animate={{
                        opacity: 1,
                        y: 0,
                      }}
                      transition={{
                        delay: 0.15,
                      }}
                    >
                      FREO
                    </motion.span>

                    <h2 className="max-w-5xl font-display text-[11vw] font-light leading-[0.9] tracking-[-0.06em] md:text-[7vw] lg:text-[5.4vw]">
                      TORNANDO O
                      <br />
                      <span className="font-black">
                        INIMAGINÁVEL
                      </span>
                      <br />
                      PALPÁVEL.
                    </h2>

                    <motion.div
                      className="mt-8 flex items-center gap-4 md:mt-10"
                      initial={{
                        opacity: 0,
                        y: 12,
                      }}
                      animate={{
                        opacity: 1,
                        y: 0,
                      }}
                      transition={{
                        delay: 0.35,
                      }}
                    >
                      <span className="h-px w-10 bg-[#DDAF34]" />

                      <span className="font-body text-[9px] uppercase tracking-[0.26em] text-white/35 md:text-[11px]">
                        Você imagina. Nós tornamos real.
                      </span>

                      <span className="h-px w-10 bg-[#DDAF34]" />
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* CONTADOR / BARRA */}
            <div className="absolute bottom-7 left-6 right-6 z-30 md:bottom-9 md:left-10 md:right-10">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-body text-[9px] uppercase tracking-[0.3em] text-white/20">
                  Freo Experience
                </span>

                <span className="font-body text-[9px] tabular-nums tracking-[0.2em] text-white/20">
                  00
                  {Math.min(
                    Math.max(phase + 1, 1),
                    5
                  )}
                  /05
                </span>
              </div>

              <div className="h-px w-full overflow-hidden bg-white/10">
                <motion.div
                  className="h-full origin-left bg-[#DDAF34]"
                  initial={{
                    scaleX: 0,
                  }}
                  animate={{
                    scaleX: 1,
                  }}
                  transition={{
                    duration: 6.5,
                    ease: "linear",
                  }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
