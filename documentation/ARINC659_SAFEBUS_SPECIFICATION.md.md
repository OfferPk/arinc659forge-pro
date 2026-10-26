# ARINC Specification 659 SafeBus Backplane Data Bus Specification

## 1\. Scope & System Definition

ARINC Specification 659 defines the physical, electrical, logical, and timing characteristics of the SafeBus high-reliability backplane data bus. Developed by Honeywell for the Boeing 777 Airplane Information Management System (AIMS) and utilized in advanced Integrated Modular Avionics (IMA) cabinets, SafeBus achieves a failure probability of less than \$10^{-10}\$ per flight hour, satisfying RTCA DO-254 Design Assurance Level A (DAL A) for flight-critical fly-by-wire and core avionics applications.

## 2\. Bus Architecture & Physical Layer

- **Total Throughput**: 60 Mbps aggregated bandwidth.  
- **Dual Redundant Serial Lines**:  
  - Bus A: 30 Mbps differential pseudo-ECL backplane trace pair.  
  - Bus B: 30 Mbps differential pseudo-ECL backplane trace pair.  
- **Deterministic Time-Division Multiple Access (TDMA)**:  
  - Repetition major cycle period \$T\_{major} \= 100.0\\ \\mu\\text{s}\$ (10 kHz cycle) or \$25.0\\text{ ms}\$ (40 Hz cycle).  
  - Pre-scheduled microsecond time slots allocating dedicated transmission windows to each LRU module.  
  - Absolute zero bus collisions and contention: no arbitration, no priority bidding, zero nondeterministic queueing.

## 3\. Fault Containment & Dual-Lockstep Comparator

- **Dual-Lockstep Bus Interface Unit (BIU)**:  
  - Each module incorporates two cross-monitored BIU lanes: Command BIU (BIU-1) and Monitor BIU (BIU-2).  
  - Inter-lane bit-by-bit comparator verifies transmissions at every clock edge.  
  - Inter-module clock synchronization window bounded to \$\\le 40\\text{ nanoseconds}\$.  
  - Skew or logic mismatch trips the driver gate off in \$\< 50\\text{ ns}\$, preventing transmission of corrupted data onto the backplane.  
- **Autonomous Hardware Babbling Idiot Suppression**:  
  - Hard-wired watch-dog timer monitors slot transmission duration.  
  - If a malfunctioning transmitter exceeds its designated slot by more than 200 ns, an independent hardware shutdown circuit permanently cuts the driver power rail without software intervention.  
- **16-Bit Frame Check Sequence (FCS)**:  
  - Polynomial \$x^{16} \+ x^{12} \+ x^5 \+ 1\$ (`0x1021`) appended to every SafeBus message frame.  
- **Fault Containment Regions (FCR)**:  
  - Physical backplane isolation ensures that a line cut or short on Bus A leaves Bus B operating at 30 Mbps simplex without interruption.