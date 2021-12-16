// Copyright (c) Microsoft Corporation
// All rights reserved.
//
// MIT License
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
// documentation files (the "Software"), to deal in the Software without restriction, including without limitation
// the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
// to permit persons to whom the Software is furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
// BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

// module dependencies
const yaml = require('js-yaml');
const mustache = require('mustache');

const createError = require('@pai/utils/error');
const hived = require('@pai/middlewares/v2/hived');
const { enabledHived } = require('@pai/config/launcher');
const protocolSchema = require('@pai/config/v2/protocol');
const asyncHandler = require('@pai/middlewares/v2/asyncHandler');
const request = require('request');

const mustacheWriter = new mustache.Writer();

const prerequisiteTypes = ['script', 'output', 'data', 'dockerimage'];

const prerequisiteFields = ['script', 'output', 'data', 'dockerImage'];

const render = (template, dict, tags = ['<%', '%>']) => {
  const tokens = mustacheWriter.parse(template, tags);
  const context = new mustache.Context(dict);
  let result = '';
  for (const token of tokens) {
    const symbol = token[0];
    let tokenStr = token[1];
    if (symbol === 'text') {
      result += tokenStr;
    } else if (symbol === 'name') {
      tokenStr = tokenStr.replace(/\[(\d+)\]/g, '.$1');
      const value = context.lookup(tokenStr);
      if (value != null) {
        result += value;
      } else {
        result += `<% ${tokenStr} %>`;
      }
    }
  }
  return result.trim();
};

const protocolValidate = (protocolYAML) => {
  const protocolObj = yaml.safeLoad(protocolYAML);
  if (!protocolSchema.validate(protocolObj)) {
    throw createError(
      'Bad Request',
      'InvalidProtocolError',
      protocolSchema.validate.errors,
    );
  }
  // convert prerequisites list to dict
  // , and record all prerequisites in prerequisiteSet
  const prerequisites = {};
  const prerequisiteSet = new Set();
  for (const type of prerequisiteTypes) {
    prerequisites[type] = {};
  }
  if ('prerequisites' in protocolObj) {
    for (const item of protocolObj.prerequisites) {
      if (
        Object.prototype.hasOwnProperty.call(
          prerequisites[item.type],
          item.name,
        )
      ) {
        throw createError(
          'Bad Request',
          'InvalidProtocolError',
          `Duplicate ${item.type} prerequisites ${item.name}.`,
        );
      } else {
        prerequisites[item.type][item.name] = item;
        prerequisiteSet.add(item.name);
      }
    }
  }
  protocolObj.prerequisites = prerequisites;
  // convert deployments list to dict
  const deployments = {};
  if ('deployments' in protocolObj) {
    for (const item of protocolObj.deployments) {
      if (Object.prototype.hasOwnProperty.call(deployments, item.name)) {
        throw createError(
          'Bad Request',
          'InvalidProtocolError',
          `Duplicate deployments ${item.name}.`,
        );
      } else {
        deployments[item.name] = item;
      }
    }
  }
  protocolObj.deployments = deployments;
  // check prerequisites in taskRoles
  for (const taskRole of Object.keys(protocolObj.taskRoles)) {
    if ('prerequisites' in protocolObj.taskRoles[taskRole]) {
      for (const prerequisite of protocolObj.taskRoles[taskRole]
        .prerequisites) {
        if (!prerequisiteSet.has(prerequisite)) {
          throw createError(
            'Bad Request',
            'InvalidProtocolError',
            `Prerequisite ${prerequisite} does not exist.`,
          );
        }
      }
    }
  }
  for (const taskRole of Object.keys(protocolObj.taskRoles)) {
    for (const field of prerequisiteFields) {
      if (
        field in protocolObj.taskRoles[taskRole] &&
        !(
          protocolObj.taskRoles[taskRole][field] in
          prerequisites[field.toLowerCase()]
        )
      ) {
        throw createError(
          'Bad Request',
          'InvalidProtocolError',
          `Prerequisite ${protocolObj.taskRoles[taskRole][field]} does not exist.`,
        );
      }
    }
  }
  // check deployment in defaults
  if ('defaults' in protocolObj) {
    if (
      'deployment' in protocolObj.defaults &&
      !(protocolObj.defaults.deployment in deployments)
    ) {
      throw createError(
        'Bad Request',
        'InvalidProtocolError',
        `Default deployment ${protocolObj.defaults.deployment} does not exist.`,
      );
    }
  }
  //如果jobPriorityClass被设置成fail，说明用户提交的任务已超出规则限制，报错提醒用户
  if (protocolObj.extras.hivedScheduler.jobPriorityClass == "fail") {
    throw createError(
      'Bad Request',
      'ResourceExceedError',
      `The resource you request exceeds the limit in the rules!\nPlease reduce the SKU count or waiting for previous job completion.`,
    );
  }
  return protocolObj;
};

const protocolRender = (protocolObj) => {
  // render auth for Docker image
  for (const name of Object.keys(protocolObj.prerequisites.dockerimage)) {
    if ('auth' in protocolObj.prerequisites.dockerimage[name]) {
      for (const prop of Object.keys(
        protocolObj.prerequisites.dockerimage[name].auth,
      )) {
        protocolObj.prerequisites.dockerimage[name].auth[prop] = render(
          protocolObj.prerequisites.dockerimage[name].auth[prop],
          {
            $secrets: protocolObj.secrets,
          },
        );
      }
    }
  }
  // render commands
  let deployment = null;
  if ('defaults' in protocolObj && 'deployment' in protocolObj.defaults) {
    deployment = protocolObj.deployments[protocolObj.defaults.deployment];
  }
  for (const taskRole of Object.keys(protocolObj.taskRoles)) {
    let commands = protocolObj.taskRoles[taskRole].commands;
    if (deployment != null && taskRole in deployment.taskRoles) {
      if ('preCommands' in deployment.taskRoles[taskRole]) {
        commands = deployment.taskRoles[taskRole].preCommands.concat(commands);
      }
      if ('postCommands' in deployment.taskRoles[taskRole]) {
        commands = commands.concat(deployment.taskRoles[taskRole].postCommands);
      }
    }
    commands = commands.map((command) => command.trim()).join('\n');
    // Will not render secret here for security issue
    const entrypoint = render(commands, {
      $parameters: protocolObj.parameters,
      $script:
        protocolObj.prerequisites.script[
        protocolObj.taskRoles[taskRole].script
        ],
      $output:
        protocolObj.prerequisites.output[
        protocolObj.taskRoles[taskRole].output
        ],
      $data:
        protocolObj.prerequisites.data[protocolObj.taskRoles[taskRole].data],
    });
    protocolObj.taskRoles[taskRole].entrypoint = entrypoint;
  }
  return protocolObj;
};


//从数据库中读取rules
const mysql = require('mysql')
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'NLPlogmein608',
  database: 'openpai'
})

function getData(sql, values) {
  return new Promise((resolve, reject) => {
    pool.getConnection(function (err, connection) {
      if (err) {
        reject(err)
      } else {
        connection.query(sql, values, (err, rows) => {
          if (err) {
            reject(err)
          } else {
            resolve(rows);
          }
          connection.release()
        })
      }
    })
  })
}

//全局application token
global.app_token = "";
//是否第一次运行标识
global.firstTimeFlag = true;

//获取已占用或已申请占用的gpu数
function get_occupied_gpu(username) {
  return new Promise(async function (resolve, reject) {

    //第一次运行，从数据库获取application token
    if (global.firstTimeFlag) {
      try {
        tokenData = await getData("select * from token");
      } catch (error) {
        reject(error);
      }
      global.app_token = tokenData[0]["app_token"];
      global.firstTimeFlag = false;
    }

    var occupied_gpu_num = 0;
    request.get(
      {
        url: 'http://localhost:9186/api/v2/jobs?username=' + username + '&state=WAITING,RUNNING',
        method: "get",
        json: true,
        headers: {
          "content-type": "application/json",
          "Authorization": "Bearer " + global.app_token
        }
      },
      function (error, response, body) {
        // console.error('error:', error);
        // console.log('statusCode:', response && response.statusCode);
        for (let i in body) {
          occupied_gpu_num += body[i]["totalGpuNumber"];
        }
        resolve(occupied_gpu_num);
      }
    );

  });
}

// 获取已占用或已申请占用的高优先级gpu数
function get_occupied_high_priority_gpu(username) {
  return new Promise(function (resolve, reject) {
    const request = require('request');
    var occupied_high_priority_gpu = 0;
    request.get(
      {
        url: 'http://localhost:9186/api/v2/jobs?username=' + username + '&state=WAITING,RUNNING&jobPriority=prod',
        method: "get",
        json: true,
        headers: {
          "content-type": "application/json",
          "Authorization": "Bearer " + global.app_token
        }
      },
      function (error, response, body) {
        // console.error('error:', error); 
        // console.log('statusCode:', response && response.statusCode);

        //累加各任务gpu数
        for (let i in body) {
          occupied_high_priority_gpu += body[i]["totalGpuNumber"];
        }
        resolve(occupied_high_priority_gpu);
      }
    );

  });
}

const protocolSubmitMiddleware = [
  async (req, res, next) => {
    if(req.body.indexOf("hivedScheduler:")==-1){
      let pos = req.body.lastIndexOf("extras:") + 7;
      let newBody = req.body.slice(0, pos) + '\n  hivedScheduler:\n    jobPriorityClass: test' + req.body.slice(pos);
      req.body = newBody;
    }
    //req:string转protocol
    var req_protocol = protocolValidate(req.body);

    //计算用户本次提交到任务所需的gpu数
    var req_gpu = 0;
    for (let i in req_protocol.taskRoles) {
      var instances = req_protocol.taskRoles[i]["instances"];
      var gpuPerInstance = req_protocol.taskRoles[i]["resourcePerInstance"]["gpu"];
      req_gpu += instances * gpuPerInstance;
    }

    var occupied_gpu = 0;
    //获取用户已占用的gpu数
    try {
      occupied_gpu = await get_occupied_gpu(req.user.username);
    } catch (error) {
      console.log("数据库连接错误！！！")
      console.log(error)
    }

    var occupy_high_priority_gpu = await get_occupied_high_priority_gpu(req.user.username);

    //用户已占用gpu和本次提交申请的gpu数之和
    var total_gpu = occupied_gpu + req_gpu;
    var total_high_priority_gpu = occupy_high_priority_gpu + req_gpu;

    //当前提交的任务的用户名、vc、优先级信息
    var req_username = req.user.username;
    var req_vc = req_protocol.defaults.virtualCluster;
    var req_priority = req_protocol.extras.hivedScheduler.jobPriorityClass;
    if (!req_priority)
      req_priority = "default";

    //数据库读出规则并验证，更改优先级
    var sql = "select * from rules order by rule_id desc";
    try {
      var rules = await getData(sql);
    } catch (error) {
      console.log("数据库连接错误！！！");
      console.log(error);
    }

    var keyword = req_priority;//keyword初始化为请求任务的优先级
    for (let i in rules) {
      let rule_id = rules[i]["rule_id"];
      let username_match = rules[i]["username_match"];
      let VC = rules[i]["VC"];
      let current_priority = rules[i]["current_priority"];
      let common_occupied_gpu_limit = rules[i]["common_occupied_gpu_limit"];
      let high_priority_occupied_gpu_limit = rules[i]["high_priority_occupied_gpu_limit"];
      let changed_priority = rules[i]["changed_priority"];
      if (req_username.match(username_match)) {//用户名匹配
        console.log(username_match,VC)
        if (!VC || (VC.indexOf(req_vc)!=-1)) {//VC为空或VC匹配
          console.log(VC);
          console.log(req_vc);
          if (!current_priority || (current_priority.indexOf(keyword) != -1)) {//优先级为空或匹配

            if (common_occupied_gpu_limit != null && total_gpu > common_occupied_gpu_limit) {//普通gpu限制不为空，且当前总申请gpu超过了普通gpu限制 
              if (changed_priority == "retain")//若即将改变的优先级为retain，rule匹配成功，不再继续匹配
                break;
              keyword = changed_priority;//改变优先级
              if (keyword == "fail")//若即将改变的优先级为fail，rule匹配成功，不再继续匹配
                break;
            }
            else if (high_priority_occupied_gpu_limit != null && total_high_priority_gpu > high_priority_occupied_gpu_limit)//高优先级gpu限制不为空，且当前总申请高优先级gpu超过了限制
            {
              if (changed_priority == "retain")//若即将改变的优先级为retain，rule匹配成功，不再继续匹配
                break;
              keyword = changed_priority;//改变优先级
              if (keyword == "fail")//若即将改变的优先级为fail，rule匹配成功，不再继续匹配
                break;
            }
            else if (common_occupied_gpu_limit == null && high_priority_occupied_gpu_limit == null) {//限制都为空则匹配规则
              if (changed_priority == "retain")//若即将改变的优先级为retain，rule匹配成功，不再继续匹配
                break;
              keyword = changed_priority;//改变优先级
              if (keyword == "fail")//若即将改变的优先级为fail，rule匹配成功，不再继续匹配
                break;
            }
            else {
              continue;
            }
          }
          else
            continue;
        }
        else {
          continue;
        }
      }
      else {
        continue;
      }
    }

    //根据规则所得keyword重新设置优先级
    var body_str = req.body;
    var priority_str = "test";
    if (keyword == "default")
      keyword = "test";
    priority_str = keyword;

    var current_priority = req_protocol.extras.hivedScheduler.jobPriorityClass;
    if (!current_priority) {
      let pos = body_str.lastIndexOf("hivedScheduler:") + 15;
      let new_body = body_str.slice(0, pos) + '\n    jobPriorityClass: ' + priority_str + body_str.slice(pos);
      req.body = new_body;
    }
    else {
      req.body = body_str.replace(/(?<=jobPriorityClass: ).+(?=\n)/, priority_str);
    }


    res.locals.protocol = req.body;
    next();
  },
  (req, res, next) => {
    res.locals.protocol = protocolValidate(res.locals.protocol);
    next();
  },
  (req, res, next) => {
    res.locals.protocol = protocolRender(res.locals.protocol);
    next();
  },
  asyncHandler(async (req, res, next) => {
    if (enabledHived) {
      res.locals.protocol = await hived.validate(
        res.locals.protocol,
        req.user.username,
      );

    }
    next();
  }),
];

// module exports
module.exports = {
  validate: protocolValidate,
  render: protocolRender,
  submit: protocolSubmitMiddleware,
};
