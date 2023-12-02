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

Within the CFBD API, play data appears to be the most suitable as it encompasses all essential details regarding the game situation and conveniently categorizes each play type, such as runs, passes, kickoffs, among others. Specifically, I will go from 2015 to present day.

```python
api_instance = cfbd.PlaysApi(cfbd.ApiClient(configuration))
# List to store the lines data for each year
all_plays = []

for year in range(2015, 2023):
  for week in range(1,15):
    try:
    # Play by play data
      api_response = api_instance.get_plays(year=year, week=week, team='Clemson')
      all_plays.extend(api_response)
    except ApiException as e:
      print("Exception when calling PlaysApi->get_plays: %s\n" % e)
```

I will put this all into a dataframe for ease of use: 

```python 
df = pd.DataFrame([
    dict(
        home = l.home,
        away = l.away,
        offense_score = l.offense_score,
        defense_score = l.defense_score,
        period = l.period,
        clock_minutes = l.clock.minutes,
        clock_seconds = l.clock.seconds,
        yards_to_goal = l.yards_to_goal,
        down = l.down,
        distance = l.distance,
        play_type = l.play_type
        )
    for l in all_plays])
```

![All Plays Dataframe](images/play_prediction_rfc/all_plays_initial.png)

# Cleanup 

We would like to know when Clemson was home while calling plays, so we calculate a column called is_home. Next we want to calculate the total seconds remaining instead of the minutes and seconds remaining, so we will combine them into one seconds_remaining category.

```python
df['is_home'] = np.where(df['home'] == 'Clemson', 1, 0)

df['seconds_remaining'] = (df['clock_minutes'] * 60) + df['clock_seconds']

```

![All Plays Post Cleanup] (images/play_prediction_rfc/after_cleanup.png)

Before constructing our random forest classifier, there's a bit more preparation needed. The 'play_type' field, as it currently stands, is too detailed, outlining both the play's type and outcome (like "Pass Incompletion" or "Rush TD"). We'll refine this to focus solely on the play calls we're interested in: rush, pass, punt, and field goal (FG). I've created a function to categorize plays into these four groups. It's worth noting that some plays, such as kickoffs, timeouts, and penalties, don't fit these categories and will be classified as 'None'. This function should now be run to modify our data frame, adding a new column for the simplified play call classification.

```python
pass_types = ['Pass Reception', 'Pass Interception Return', 'Pass Incompletion', 'Sack', 'Passing Touchdown', 'Interception Return Touchdown']
rush_types = ['Rush', 'Rushing Touchdown']
punt_types = ['Punt', 'Punt Return Touchdown', 'Blocked Punt', 'Blocked Punt Touchdown']
fg_types = ['Field Goal Good', 'Field Goal Missed', 'Blocked Field Goal']

def getPlayCall(x):
    if x in pass_types:
            return 'pass'
    elif x in rush_types:
        return 'rush'
    elif x in punt_types:
        return 'punt'
    elif x in fg_types:
        return 'fg'
    else:
        return None

df['play_call'] = df['play_type'].apply(getPlayCall)
```

What should we do with play types that don't align with our four main play call categories? For the purposes of this project, these plays are irrelevant. Recall that we assigned a 'None' value to these types of plays. Fortunately, Pandas provides a handy function to eliminate rows with missing values. We can even specify which columns to consider when deciding which rows to remove. To clean our data and keep it focused on our study's scope, execute the following code to discard these irrelevant rows.


```python
df.dropna(subset=['play_call'], inplace=True)
```

Let's eliminate any unnecessary columns, specifically those used solely for deriving new columns. To preserve these columns for potential future adjustments, I'll transfer the current data frame into a new variable. This step ensures that we retain access to the original data for any further modifications.

```python
plays = df[['offense_score', 'defense_score', 'period', 'yards_to_goal', 'down', 'distance', 'is_home', 'seconds_remaining', 'play_call']]
```

