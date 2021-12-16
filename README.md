## 构建步骤：

1.参考[openpai wiki](https://github.com/microsoft/pai/wiki/Build-PAI-Containers-from-Source)重构rest-server镜像，或master物理机运行rest-server源码，参考[rest-server_local_readme.md](./rest-server_local_readme.md)

2.在master上创建mysql，端口为3306(物理机或容器安装皆可)，创建database：openpai，把[openpai.sql](./openpai.sql)导入，admin用户到webportal中创建一个application token，并复制到token表中

3.根据需求修改数据库rules表



### 需求来源：

需求源于要加强集群资源管理，防止误用滥用，但偶尔还需要改变策略以应对特殊情况，具体表现为

1、防止特定队列中的某些用户提交不符合规则的任务

2、可以根据需要动态地变更特定用户的独有规则

### 应对方法

1、使用openpai已有的优先级管理，保证高优先级任务可以抢占低优先级任务。使用VC（即队列）划分特定节点，并控制VC的权限，以达到区分卡类型的目的

2、openpai的所有任务都会由webportal(前端界面)提交到rest-server。在rest-server上对任务做一层变更，变更指向下更改任务的优先级，如高优先级prod调整到普通test，或oppo调整到fail

3、使用规则命中的方法来决定对任务的变更动作。规则中的每一项都要匹配(数据库中某项为空，默认此项匹配成功)，用户名，队列，原始优先级为正则表达式匹配，其余为比较表达式匹配，匹配命中则输出此条规则所指示的“变更后的优先级”，这里保留两个关键字：retain和fail，分别表示不更改优先级和任务提交失败。只有当规则匹配之后是retain或fail时，后面的规则才不再匹配。

规则示例：

| 用户名      | 队列 | 原始优先级        | 当前任务资源 | 已占用资源 | 已占用高优先级资源 | 变更后的优先级 | 变更说明                 |
| ----------- | ---- | ----------------- | ------------ | ---------- | ------------------ | -------------- | ------------------------ |
| ^fa_test$   |      |                   |              |            |                    | retain         |                          |
| ^fa_test2$  |      | prod/test/default |              |            | 4                  | oppo           |                          |
| ^fa_test2$  |      | prod/test/default |              |            | 0                  | retain         |                          |
| ^fa_test2$  |      | oppo              |              | 30         |                    | fail           |                          |
| ^fa_test2$  |      | oppo              |              | 0          |                    | retain         |                          |
| ^user_proh$ |      |                   |              |            |                    | fail           |                          |
| ^fa.*       |      | prod/test/default |              |            | 2                  | oppo           |                          |
| ^fa.*       |      | prod/test/default |              |            | 0                  | retain         |                          |
| .*          |      | prod/test/default |              |            |                    | oppo           | 普通用户只能提交oppo任务 |
| .*          |      | oppo              |              | 20         |                    | fail           | 超过20将失败             |
| .*          |      | oppo              |              | 0          |                    | retain         |                          |
| .*          |      |                   |              |            |                    | retain         |                          |

上述规则将实现：

* 普通用户，只能提交oppo的任务，且GPU卡在20以内，超过20的任务都将失败
* fa用户可以提交2卡高优先级任务，超过2卡的将转为oppo任务，且oppo的任务也不能超过20
* user_proh被禁止提交任务了
* fa_test2有更多的资源，可以同时拥有4卡高优先级和30卡oppo任务
* fa_test可以任意提交任务，不受限制

4、规则写入数据库，id自增，匹配时按id降序匹配，如果数据库失效，报warning，视为没有规则，即所有任务不做更改

5、如果任务因为命中规则而失败，将所有命中过的规则所带有的“变更说明”告知用户

6、原需求中附带了GPU利用率、任务运行时间太长的检测和杀死，使用prometheus和Alert-Manager实现



