# 步骤：

1.在master上，运行docker inspect <rest-server container name>命令，复制到.env文件中。

2.使用docker cp命令将rest-server容器中的/group-configuration,/hived-spec,/k8s-job-exit-spec-configuration,/pai-cluster-config四个文件夹复制到master宿主机

3.到dev-box中停掉rest-server服务

4.将pai的源码拉到master本地，把.env文件([参考](./src/rest-server/.env))放入rest-server根目录/[path]/rest-server下，.env文件中可以修改各种配置，注意在Kubernetes体系外部运行，需要把端口改为9186供webportal访问

5.安装nodejs，10版本之后需要修改/[path]/pai/src/rest-server/src/models/token.js中的第19行,否则登录鉴权会报错

​	`const uuid = require('uuid');`

改为：

​	`const uuid = require('uuid').v4;`

6.修改pai/src/rest-server/src/models/v2/utils/frameworkConverter.js 第122行为exitSpecPath实际路径

7.在pai/src/rest-server路径下npm install,安装package.json中的依赖

8.运行bash pai/src/rest-server/build/build-pre.sh

9.node /[path]/pai/index.js即可运行，api可访问



### tips:

当容器配置发生变化，如添加/删除结点后，需要开启rest-server服务，复制新的rest-server的配置文件到本地，再关掉rest-server服务，启动本地服务