# Dev backend processes exit when their parent dies

`pikku dev` runs one `--serveOnly` child per backend. SIGTERM is forwarded, but a SIGKILLed parent cannot forward anything, so the children now poll their parent (ppid change or pid gone) once a second and exit. The codegen lock also stops counting a zombie pid as a live holder (read from /proc), since in a container without a reaping init a killed `pikku all` stays a zombie and would block every later run for the 5 minute lock timeout. Suspected cause of the CI "runs finish after a SIGTERM" timeout; not reproduced locally.
