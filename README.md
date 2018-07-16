Ibenchjs is a scalability-oriented benchmark framework, and a set of sample test applications. Ibenchjs can evaluate and measure different scalability strategies applied in Node.js.
In this version, Ibenchjs only runs on Docker Swarm. Therefore, a Docker Swarm should be setup to use this benchmark framework.
Overall, Ibenchjs follows a two-tier architectural model, which consists of a client side and a server side.
The Ibenchjs benchmark framework consists of five components: the executor, the RC, the analyzer, the register, and the image registry; they run in either the client or the server side.

