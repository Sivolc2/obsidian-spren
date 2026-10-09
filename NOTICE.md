# Notice: the fly brain data

`src/engine/fly_circuit.json`, and the copy of it embedded in `main.js`, is not covered by the MIT licence of the code.

**What it is.** A sub-network of 2,234 neurons and about 170,000 connections taken from the FlyWire whole-brain connectome of an adult *Drosophila melanogaster* (FAFB, public release v783): for each connection, the two neurons and a signed weight, plus the parameters of the neuron model and the lists of input and output neurons. It contains no cell-type names and no positions.

**Where it came from.** The connectivity and the leaky integrate-and-fire model are those of Shiu et al. (2024), taken from <https://github.com/philshiu/Drosophila_brain_model> (code MIT, © 2023 Philip Shiu and Nico Spiller). That connectivity is derived from the FlyWire connectome.

**Changes made.** The full brain (138,639 neurons) was run under the stimuli this project uses (sugar on the tongue, something looming, touch), and only the neurons that fired, with the connections among them, were kept.

**Licence.** Published FlyWire data is released under the [Creative Commons Attribution-NonCommercial 4.0 International licence](https://creativecommons.org/licenses/by-nc/4.0/) (see the [FlyWire principles](https://flywire.ai/principles)). This derived file is offered under the same licence: you may share and adapt it for non-commercial purposes, with credit and an indication of changes.

**Please cite.**

- Dorkenwald, S. et al. Neuronal wiring diagram of an adult brain. *Nature* 634, 124–138 (2024).
- Schlegel, P. et al. Whole-brain annotation and multi-connectome cell typing of *Drosophila*. *Nature* 634, 139–152 (2024).
- Shiu, P. K. et al. A *Drosophila* computational brain model reveals sensorimotor processing. *Nature* 634, 210–219 (2024).
- Zheng, Z. et al. A complete electron microscopy volume of the brain of adult *Drosophila melanogaster*. *Cell* 174, 730–743 (2018).
