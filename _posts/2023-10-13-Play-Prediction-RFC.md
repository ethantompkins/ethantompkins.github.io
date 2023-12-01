---
layout: post
title: "Forecasting Football Plays with a Random Forest Classifier"
categories: journal
date: 2023-10-13
tags: ['python']
---

# Background Information

Random forests are a method of ensemble learning for classification, regression, and other tasks that involve decision trees during training time. For ensemble learning, several different predictive models are created to solve a particular problem. The several different models are then combined into a single model with the goal of producing a final robust model using the power of many.

Random forests work by generation many decision trees at random. Once a prediction is made, each decision tree is evaluated based on the inputs. The output of each tree gets counted and the modal outcome is selected as the final prediction. Random forests can be used to output classifications and for regression analysis, making them enticing in many scenarios.

Since play calling is so different between programs, we will be using a specific coach and try to predict based on their historical tendencies. Becuase of this, I will be using Dabo Swinney and the Clemson Tigers. 

# Gathering and Cleaning the data

For this we are using numpy, pandas, and the cfbd libraries.

```python
import numpy as np
import pandas as pd
import requests
import cfbd
from cfbd.rest import ApiException
```

Within the CFBD API, play data appears to be the most suitable as it encompasses all essential details regarding the game situation and conveniently categorizes each play type, such as runs, passes, kickoffs, among others. 