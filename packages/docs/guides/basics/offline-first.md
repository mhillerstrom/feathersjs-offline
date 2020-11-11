# Offline-first
Right - we have a real-time application running, but how do we get our application to be offline-first? Well, it very simple - in fact so simple it ought to be illegal!

First we have to import the necessary wrappers; one for the client and on for the server.

:::: tabs :options="{ useUrlFragment: false }"
::: tab "Client"
```js
// ...
import { owndataWrapper } from '@feathersjs-offline/owndata';
// ...
app.use('messages');
owndataWrapper(app, 'messages'); // Wrap the service; use the own-data principle
```
:::
::: tab "Server"
```js
// ...
import { RealtimeServiceWrapper } from '@feathersjs-offline/server';
// ...
// app.use('messages', Messages());

// Wrap the service; supports both own-data/own-net principles
const RealtimeMessages = RealtimeServiceWrapper(Messages());
app.use('messages', RealtimeMessages());
```
:::
::::

and that's it! From now on, all activity on the `messages` service on the client will be handled in a client-first server-later (possibly very shortly) manner. What's more, whenever the client has a valid connection to the server it will synchronize all changes made on the device while offline.

> __Note:__ For this to work you must ensure the service implements the date fields `updatedAt`, `onServerAt`, and the id field `uuid`. The wrapper will do all handling of the fields behind the scenes. (The `uuid` doen not _have_ to be the id field but it is considered good practice).

> __Note:__ If you want to know more about _how_ the wrappers work read [own-data/own-net implementation](./implementation.md).

# Come-on it can't be that simple!
Well, it almost is due to Feathers clever adapter implementation. All adapters able to pass the adapterTests should work seamlessly with the realtime wrappers. But, you have to make one or two choices by answering a couple of questions:

1. Is your application
